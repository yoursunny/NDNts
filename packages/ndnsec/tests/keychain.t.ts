import * as TestCertStore from "@ndn/keychain/test-fixture/cert-store";
import * as TestKeyStore from "@ndn/keychain/test-fixture/key-store";
import { execaSync } from "execa";
import { dirSync as tmpDir } from "tmp";
import { afterEach, beforeEach, describe, test } from "vitest";

import { NdnsecKeyChain } from "..";

describe("ndn-cxx keychain", () => {
  if (execaSync("ndnsec", ["version"], { reject: false }).exitCode !== 0) {
    test.skip("ndnsec is not installed", () => undefined);
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
    const enabled: TestKeyStore.Enable = { HMAC: false, Ed25519: false };
    const keyChain = new NdnsecKeyChain({ home });
    const record = await TestKeyStore.execute(keyChain, enabled);
    TestKeyStore.check(record, enabled);
  }, 20000);

  test("CertStore", async () => {
    const keyChain = new NdnsecKeyChain({ home });
    const record = await TestCertStore.execute(keyChain);
    TestCertStore.check(record);
  }, 20000);
});
