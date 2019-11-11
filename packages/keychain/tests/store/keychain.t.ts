import { dirSync as tmpDir } from "tmp";

import { KeyChain } from "../..";
import * as TestCertStore from "../../test-fixture/cert-store";
import * as TestKeyStore from "../../test-fixture/key-store";

test("temp KeyStore", async () => {
  const keyChain = KeyChain.createTemp();
  const record = await TestKeyStore.execute(keyChain);
  TestKeyStore.check(record);
});

test("temp CertStore", async () => {
  const keyChain = KeyChain.createTemp();
  const record = await TestCertStore.execute(keyChain);
  TestCertStore.check(record);
});

describe("persistent", () => {
  let locator: string;
  let deleteTmpDir: () => void;

  beforeEach(async () => {
    ({ name: locator, removeCallback: deleteTmpDir } = tmpDir({ unsafeCleanup: true }));
  });

  beforeEach(() => {
    deleteTmpDir();
  });

  test("persistent KeyStore", async () => {
    const keyChain = KeyChain.open(locator);
    const record = await TestKeyStore.execute(keyChain);
    TestKeyStore.check(record);
  });

  test("persistent CertStore", async () => {
    const keyChain = KeyChain.open(locator);
    const record = await TestCertStore.execute(keyChain);
    TestCertStore.check(record);
  });
});
