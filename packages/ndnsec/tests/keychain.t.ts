import * as TestCertStore from "@ndn/keychain/test-fixture/cert-store";
import * as TestKeyStore from "@ndn/keychain/test-fixture/key-store";
import execa from "execa";
import { dirSync as tmpDir } from "tmp";

import { NdnsecKeyChain } from "..";

describe("ndn-cxx keychain", () => {
  if (execa.sync("ndnsec", ["version"], { reject: false }).exitCode !== 0) {
    test.skip("ndnsec is not installed"); // eslint-disable-line jest/no-disabled-tests
    return;
  }

  let home: string;
  let deleteTmpDir: () => void;

  beforeEach(async () => {
    ({ name: home, removeCallback: deleteTmpDir } = tmpDir({ unsafeCleanup: true }));
  });

  afterEach(() => {
    deleteTmpDir();
  });

  test("KeyStore", async () => {
    const keyChain = new NdnsecKeyChain({ home });
    const record = await TestKeyStore.execute(keyChain, { skipHmac: true });
    TestKeyStore.check(record, { skipHmac: true });
  }, 20000);

  test("CertStore", async () => {
    const keyChain = new NdnsecKeyChain({ home });
    const record = await TestCertStore.execute(keyChain);
    TestCertStore.check(record);
  }, 20000);
});
