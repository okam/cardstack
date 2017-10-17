const path = require('path');
const fs = require('fs');
const {promisify} = require('util');
const writeFile = promisify(fs.writeFile);

const superagent = require('superagent');
const quickTemp = require('quick-temp');
const Plugin = require('broccoli-plugin');
const {WatchedDir} = require('broccoli-source');

class CodeWriter extends Plugin {
  constructor(branch, trigger) {
    super([trigger], { name: '@cardstack/hub', needsCache: false });

    this.branch = branch;
  }

  async build() {
    let filePath = path.join(this.outputPath, 'cardstack-generated.js');
    let request = superagent.get('http://localhost:3000/codegen/master');
    let writeStream = fs.createWriteStream(filePath);
    request.pipe(writeStream);

    return new Promise(function(resolve, reject) {
      request.on('error', reject);
      request.on('end', resolve);
    });
  }
}

module.exports = class BroccoliConnector {
  constructor(branch) {
    quickTemp.makeOrRemake(this, '_triggerDir', 'cardstack-hub');
    this._trigger = new WatchedDir(this._triggerDir, { annotation: '@cardstack/hub' });
    this.tree = new CodeWriter(branch, this._trigger);
    this._buildCounter = 0;
  }
  triggerRebuild() {
    let triggerPath = path.join(this._triggerDir, 'cardstack-build');
    writeFile(triggerPath, String(this._buildCounter++), 'utf8');
  }
};