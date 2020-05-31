import "@ndn/packet/test-fixture/expect";

import { Data } from "@ndn/packet";
import { dirSync as tmpDir } from "tmp";

import { Certificate, EcPrivateKey, KeyChain } from "../..";
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

  afterEach(() => {
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

test("createSigner", async () => {
  const keyChain = KeyChain.createTemp();
  const [pvt, pub] = await EcPrivateKey.generate("/K", "P-256", keyChain);
  const cert = await Certificate.selfSign({
    privateKey: pvt,
    publicKey: pub,
  });
  await keyChain.insertCert(cert);

  const keySigner = await keyChain.createSigner(pvt.name);
  let data = new Data("/D");
  await keySigner.sign(data);
  expect(data.sigInfo?.keyLocator?.name).toEqualName(pub.name);

  const certSigner = await keyChain.createSigner(cert.name);
  data = new Data("/D");
  await certSigner.sign(data);
  expect(data.sigInfo?.keyLocator?.name).toEqualName(cert.name);
});
