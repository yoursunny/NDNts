import "./webcrypto";

import { ECDSA, generateSigningKey, HMAC, KeyChain, RSA } from "@ndn/keychain";
import { execute as testCertStore } from "@ndn/keychain/test-fixture/cert-store";
import { execute as testKeyStore } from "@ndn/keychain/test-fixture/key-store";
import { Data, digestSigning, Interest, Signer, Verifier } from "@ndn/packet";
import { execute as testSignVerify } from "@ndn/packet/test-fixture/sign-verify";

import { SerializedInBrowser, serializeInBrowser } from "../../test-fixture/serialize";

window.testKeyStore = () => {
  return testKeyStore(KeyChain.open("296616c2-7abb-4d9e-94b3-a97e4fd327b5"));
};

window.testCertStore = () => {
  return testCertStore(KeyChain.open("005a04be-9752-4f1f-adaf-b52f31742b37"));
};

async function testKey(pvtA: Signer, pubA: Verifier,
    pvtB: Signer, pubB: Verifier): Promise<SerializedInBrowser> {
  return serializeInBrowser(await Promise.all([
    testSignVerify(Interest, pvtA, pubA, pvtB, pubB),
    testSignVerify(Data, pvtA, pubA, pvtB, pubB),
  ]));
}

window.testDigestKey = () => {
  return testKey(digestSigning, digestSigning, digestSigning, digestSigning);
};

window.testEcKey = async () => {
  const [pvtA, pubA] = await generateSigningKey("/EC-A", ECDSA);
  const [pvtB, pubB] = await generateSigningKey("/EC-B", ECDSA);
  return testKey(pvtA, pubA, pvtB, pubB);
};

window.testRsaKey = async () => {
  const [pvtA, pubA] = await generateSigningKey("/RSA-A", RSA);
  const [pvtB, pubB] = await generateSigningKey("/RSA-B", RSA);
  return testKey(pvtA, pubA, pvtB, pubB);
};

window.testHmacKey = async () => {
  const [pvtA, pubA] = await generateSigningKey("/HMAC-A", HMAC);
  const [pvtB, pubB] = await generateSigningKey("/HMAC-B", HMAC);
  return testKey(pvtA, pubA, pvtB, pubB);
};
