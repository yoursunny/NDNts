import "./ndncert";
import "./webcrypto";

import { EcPrivateKey, HmacKey, KeyChain, PrivateKey, PublicKey, RsaPrivateKey, theDigestKey } from "@ndn/keychain";
import { execute as testCertStore } from "@ndn/keychain/test-fixture/cert-store";
import { execute as testKeyStore } from "@ndn/keychain/test-fixture/key-store";
import { execute as testSignVerify } from "@ndn/keychain/test-fixture/sign-verify";
import { Data, Interest } from "@ndn/packet";

import { SerializedInBrowser, serializeInBrowser } from "../../test-fixture/serialize";
import { SignVerifyTestResult } from "./api";

window.testKeyStore = () => {
  return testKeyStore(KeyChain.open("296616c2-7abb-4d9e-94b3-a97e4fd327b5"));
};

window.testCertStore = () => {
  return testCertStore(KeyChain.open("005a04be-9752-4f1f-adaf-b52f31742b37"));
};

async function testKey(pvtA: PrivateKey, pubA: PublicKey,
                       pvtB: PrivateKey, pubB: PublicKey): Promise<SerializedInBrowser> {
  return serializeInBrowser(await Promise.all([
    testSignVerify(Interest, pvtA, pubA, pvtB, pubB),
    testSignVerify(Data, pvtA, pubA, pvtB, pubB),
  ]) as SignVerifyTestResult);
}

window.testDigestKey = () => {
  return testKey(theDigestKey, theDigestKey, theDigestKey, theDigestKey);
};

window.testEcKey = async () => {
  const [pvtA, pubA] = await EcPrivateKey.generate("/EC-A", "P-256");
  const [pvtB, pubB] = await EcPrivateKey.generate("/EC-B", "P-256");
  return testKey(pvtA, pubA, pvtB, pubB);
};

window.testRsaKey = async () => {
  const [pvtA, pubA] = await RsaPrivateKey.generate("/RSA-A", 2048);
  const [pvtB, pubB] = await RsaPrivateKey.generate("/RSA-B", 2048);
  return testKey(pvtA, pubA, pvtB, pubB);
};

window.testHmacKey = async () => {
  const keyA = await HmacKey.generate("/HMAC-A");
  const keyB = await HmacKey.generate("/HMAC-B");
  return testKey(keyA, keyA, keyB, keyB);
};
