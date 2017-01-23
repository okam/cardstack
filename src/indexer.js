const {
  Repository,
  Reference,
  Branch,
  Commit
} = require('nodegit');

const { safeEntryByName } = require('./mutable-tree');

const logger = require('heimdalljs-logger');
const makeClient = require('./elastic-client');
const { isEqual } = require('lodash');

module.exports = class Indexer {
  constructor({ elasticsearch, repoPath }) {
    this.es = makeClient(elasticsearch);
    this.repoPath = repoPath;
    this.repo = null;
    this.log = logger('indexer');
  }

  async update() {
    await this._ensureRepo();
    let branches = await this._branches();
    await Promise.all(branches.map(branch => this._updateBranch(branch)));
  }

  async _ensureRepo() {
    if (!this.repo) {
      this.repo = await Repository.open(this.repoPath);
    }
  }

  async _esMapping(branch) {
    let mapping = await this.es.indices.getMapping({ index: branch, ignore: [404] });
    if (mapping.status === 404) {
      return null;
    } else {
      return mapping;
    }
  }

  async _gitMapping(branchName) {
    let branch = await Branch.lookup(this.repo, branchName, Branch.BRANCH.LOCAL);
    let commit = await Commit.lookup(this.repo, branch.target());
    let tree = await commit.getTree();
    let entry = await safeEntryByName(tree, 'mapping.json');
    if (entry && entry.isBlob()) {
      let buffer = (await entry.getBlob()).content();
      let mapping = JSON.parse(buffer);
      return mapping;
    } else {
      return {};
    }
  }

  async _updateBranch(branch) {
    let haveMapping = await this._esMapping(branch);
    let wantMapping = await this._gitMapping(branch);
    if (isEqual(haveMapping, wantMapping)) {
      this.log.info(`${branch}: mapping already OK`);
    } else {
      this.log.info(`${branch}: mapping needs update`);
      await this.es.indices.create({
        index: `${branch}_1`,
        body: {
          mappings: wantMapping
        }
      });
    }
  }

  async _branches() {
    // nodegit docs show a Branch.iteratorNew method that would be
    // more appropriate than this, but as far as I can tell it is not
    // fully implemented
    return (await Reference.list(this.repo)).map(entry => entry.replace(/^refs\/heads\//, ''));
  }

};
 
