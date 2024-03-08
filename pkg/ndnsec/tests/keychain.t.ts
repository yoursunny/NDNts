import * as TestCertStore from "@ndn/keychain/test-fixture/cert-store";
import * as TestKeyStore from "@ndn/keychain/test-fixture/key-store";
import { makeTmpDir } from "@ndn/util/test-fixture/tmp";
import { test } from "vitest";

import { NdnsecKeyChain } from "..";

test.runIf(NdnsecKeyChain.supported)("KeyStore", { timeout: 20000 }, async () => {
  using tmpDir = makeTmpDir();
  const enabled: TestKeyStore.Enable = { HMAC: false, Ed25519: false };
  const keyChain = new NdnsecKeyChain({ home: tmpDir.name });
  const record = await TestKeyStore.execute(keyChain, enabled);
  TestKeyStore.check(record, enabled);
});

test.runIf(NdnsecKeyChain.supported)("CertStore", { timeout: 20000 }, async () => {
  using tmpDir = makeTmpDir();
  const keyChain = new NdnsecKeyChain({ home: tmpDir.name });
  const record = await TestCertStore.execute(keyChain);
  TestCertStore.check(record);
});
