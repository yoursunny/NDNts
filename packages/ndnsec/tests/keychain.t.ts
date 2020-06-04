import * as TestCertStore from "@ndn/keychain/test-fixture/cert-store";
import execa from "execa";
import { dirSync as tmpDir } from "tmp";

import { NdnsecKeyChain } from "..";

describe("ndn-cxx keychain", () => {
  if (execa.sync("which", ["ndnsec"], { reject: false }).exitCode !== 0) {
    // eslint-disable-next-line jest/no-disabled-tests
    test.skip("ndnsec is not installed", () => undefined);
    return;
  }

  let homedir: string;
  let deleteTmpDir: () => void;

  beforeEach(async () => {
    ({ name: homedir, removeCallback: deleteTmpDir } = tmpDir({ unsafeCleanup: true }));
  });

  afterEach(() => {
    deleteTmpDir();
  });

  test("CertStore", async () => {
    const keyChain = new NdnsecKeyChain(homedir);
    const record = await TestCertStore.execute(keyChain);
    TestCertStore.check(record);
  }, 10000);
});
