import "./webcrypto";

import { Certificate, CryptoAlgorithmListFull, EcCurve, ECDSA, generateSigningKey, HMAC, KeyChain, KeyChainImplWebCrypto as crypto, RSA, RsaModulusLength } from "@ndn/keychain";
import { execute as testCertStore } from "@ndn/keychain/test-fixture/cert-store";
import { execute as testKeyStore } from "@ndn/keychain/test-fixture/key-store";
import { SafeBag } from "@ndn/ndnsec";
import { type Signer, type Verifier, Data, digestSigning, Interest } from "@ndn/packet";
import { execute as testSignVerify } from "@ndn/packet/test-fixture/sign-verify";
import { Decoder, Encoder } from "@ndn/tlv";

import * as Serialize from "../../test-fixture/serialize";
import type { SignVerifyTestResult } from "./api";

window.testKeyStore = () => testKeyStore(KeyChain.open("296616c2-7abb-4d9e-94b3-a97e4fd327b5", CryptoAlgorithmListFull));

window.testCertStore = () => testCertStore(KeyChain.open("005a04be-9752-4f1f-adaf-b52f31742b37"));

async function testSigningKey(pvtA: Signer, pubA: Verifier,
    pvtB: Signer, pubB: Verifier): Promise<Serialize.Value<SignVerifyTestResult>> {
  return Serialize.stringify(await Promise.all([
    testSignVerify(Interest, pvtA, pubA, pvtB, pubB),
    testSignVerify(Data, pvtA, pubA, pvtB, pubB),
  ]));
}

window.testDigestSigning = () => testSigningKey(digestSigning, digestSigning, digestSigning, digestSigning);

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

window.testSafeBagDecode = async (wire: Serialize.Value<Uint8Array>, passphrase: string) => {
  const keyChain = KeyChain.createTemp(CryptoAlgorithmListFull);
  const safeBag = new Decoder(Serialize.parse(wire)).decode(SafeBag);
  const certName = safeBag.certificate.name;
  await safeBag.saveKeyPair(passphrase, keyChain);
  const pvt = await keyChain.getSigner(certName);

  const data = new Data("/D");
  await pvt.sign(data);
  return [data.sigInfo.type, `${certName}`];
};

window.testSafeBagEncode = async (passphrase: string) => {
  const keyPair = await ECDSA.cryptoGenerate({}, true);
  const pkcs8 = new Uint8Array(await crypto.subtle.exportKey("pkcs8", keyPair.privateKey));

  const [privateKey, publicKey] = await generateSigningKey(
    "/S", ECDSA, { importPkcs8: [pkcs8, keyPair.spki] });
  const cert = await Certificate.selfSign({ privateKey, publicKey });
  const safeBag = await SafeBag.create(cert, pkcs8, passphrase);
  return Serialize.stringify(Encoder.encode(safeBag));
};
