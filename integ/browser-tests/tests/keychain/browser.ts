import "./webcrypto";

import { EcCurve, ECDSA, generateSigningKey, HMAC, KeyChain, RSA, RsaModulusLength } from "@ndn/keychain";
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

async function testSigningKey(pvtA: Signer, pubA: Verifier,
    pvtB: Signer, pubB: Verifier): Promise<SerializedInBrowser> {
  return serializeInBrowser(await Promise.all([
    testSignVerify(Interest, pvtA, pubA, pvtB, pubB),
    testSignVerify(Data, pvtA, pubA, pvtB, pubB),
  ]));
}

window.testDigestSigning = () => {
  return testSigningKey(digestSigning, digestSigning, digestSigning, digestSigning);
};

window.testECDSA = async (curve: EcCurve) => {
  const [pvtA, pubA] = await generateSigningKey("/EC-A", ECDSA, { curve });
  const [pvtB, pubB] = await generateSigningKey("/EC-B", ECDSA, { curve });
  return testSigningKey(pvtA, pubA, pvtB, pubB);
};

window.testRSA = async (modulusLength: RsaModulusLength) => {
  const [pvtA, pubA] = await generateSigningKey("/RSA-A", RSA, { modulusLength });
  const [pvtB, pubB] = await generateSigningKey("/RSA-B", RSA, { modulusLength });
  return testSigningKey(pvtA, pubA, pvtB, pubB);
};

window.testHMAC = async () => {
  const [pvtA, pubA] = await generateSigningKey("/HMAC-A", HMAC);
  const [pvtB, pubB] = await generateSigningKey("/HMAC-B", HMAC);
  return testSigningKey(pvtA, pubA, pvtB, pubB);
};
