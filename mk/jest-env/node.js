const NodeEnvironment = require("jest-environment-node");

class MyEnvironment extends NodeEnvironment {
  async setup() {
    await super.setup();
    this.global.Uint8Array = Uint8Array;
  }
}

module.exports = MyEnvironment;
