const PuppetteerEnvironment = require("jest-environment-puppeteer");

class MyEnvironment extends PuppetteerEnvironment {
  async setup() {
    await super.setup();
    this.global.Uint8Array = Uint8Array;
  }
}

module.exports = MyEnvironment;
