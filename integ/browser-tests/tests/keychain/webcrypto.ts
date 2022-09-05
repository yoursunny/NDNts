import { type NamedEncrypter, type NamedSigner, type NamedVerifier, AESCBC, AESCTR, AESGCM, AesKeyLength, Certificate, createVerifier, CryptoAlgorithmListFull, EcCurve, ECDSA, Ed25519, generateEncryptionKey, generateSigningKey, HMAC, KeyChain, RSA, RsaModulusLength, RSAOAEP, SigningAlgorithmListFull } from "@ndn/keychain";
import * as sample_certs from "@ndn/keychain/test-fixture/certs";
import { type LLDecrypt, type LLEncrypt, type Signer, type Verifier, Data, digestSigning, Name } from "@ndn/packet";
import { Decoder, Encoder } from "@ndn/tlv";
import { timingSafeEqual } from "@ndn/util";

import { addManualTest } from "../../test-fixture/manual";

let keyChain: KeyChain;

async function deleteFromKeyChain(key: { name?: Name }) {
  if (key.name instanceof Name) {
    await keyChain.deleteKey(key.name);
  }
}

async function testSigningKey(keyPair: Promise<[Signer, Verifier]>, canMakeCert = true) {
  const [pvt, pub] = await keyPair;
  await deleteFromKeyChain(pvt as NamedSigner);
  let verifier = pub;

  if (canMakeCert) {
    const cert = await Certificate.selfSign({
      publicKey: pub as NamedVerifier.PublicKey,
      privateKey: pvt as NamedSigner.PrivateKey,
    });
    verifier = await createVerifier(cert, { algoList: SigningAlgorithmListFull });
  }

  let pkt = new Data("/D");
  await pvt.sign(pkt);
  pkt = new Decoder(Encoder.encode(pkt)).decode(Data);
  await verifier.verify(pkt);
}

async function testEncryptionKey(keyPair: Promise<[LLEncrypt.Key, LLDecrypt.Key]>, aead = false) {
  const [enc, dec] = await keyPair;
  await deleteFromKeyChain(enc as NamedEncrypter);

  const plaintext = crypto.getRandomValues(new Uint8Array(125));
  const additionalData = aead ? crypto.getRandomValues(new Uint8Array(17)) : undefined;
  const encrypted = await enc.llEncrypt({ plaintext, additionalData });
  const decrypted = await dec.llDecrypt({ additionalData, ...encrypted });
  if (!timingSafeEqual(plaintext, decrypted.plaintext)) {
    throw new Error("decryption result differs");
  }
}

async function checkWebCrypto() {
  const lines: string[] = [];
  const run = async (title: string, promise: Promise<void> | (() => Promise<void>)) => {
    if (typeof promise === "function") {
      promise = promise();
    }
    let result: string;
    try {
      await promise;
      result = "OK";
    } catch (err: unknown) {
      result = err instanceof Error ? err.toString() : `${err}`;
    }
    lines.push(`${title}: ${result}`);
  };

  keyChain = KeyChain.open("d32a0124-acfa-4073-a939-2c0e9bb70388", CryptoAlgorithmListFull);

  await run("digest", testSigningKey(Promise.resolve([digestSigning, digestSigning]), false));
  for (const curve of EcCurve.Choices) {
    await run(`ECDSA ${curve}`, testSigningKey(generateSigningKey(keyChain, "/S", ECDSA, { curve })));
  }
  for (const modulusLength of RsaModulusLength.Choices) {
    await run(`RSA ${modulusLength}`, testSigningKey(generateSigningKey(keyChain, "/S", RSA, { modulusLength })));
  }
  await run("HMAC", testSigningKey(generateSigningKey(keyChain, "/S", HMAC), false));
  await run("Ed25519", testSigningKey(generateSigningKey(keyChain, "/S", Ed25519)));

  for (const length of AesKeyLength.Choices) {
    await run(`AES-CBC ${length}`, testEncryptionKey(generateEncryptionKey(keyChain, "/E", AESCBC, { length })));
  }
  for (const length of AesKeyLength.Choices) {
    await run(`AES-CTR ${length}`, testEncryptionKey(generateEncryptionKey(keyChain, "/E", AESCTR, { length })));
  }
  for (const length of AesKeyLength.Choices) {
    await run(`AES-GCM ${length}`, testEncryptionKey(generateEncryptionKey(keyChain, "/E", AESGCM, { length }), true));
  }
  for (const modulusLength of RsaModulusLength.Choices) {
    await run(`RSA-OAEP ${modulusLength}`, testEncryptionKey(generateEncryptionKey(keyChain, "/E", RSAOAEP, { modulusLength }), true));
  }

  let testbedRootKey: NamedVerifier.PublicKey | undefined;
  await run("import testbed root certificate", async () => {
    const cert = Certificate.fromData(sample_certs.TestbedRootX3());
    testbedRootKey = await createVerifier(cert, { checkValidity: false });
  });
  await run("import and verify testbed site certificate", async () => {
    const cert = Certificate.fromData(sample_certs.TestbedNeu20201217());
    await createVerifier(cert, { checkValidity: false });
    await testbedRootKey?.verify(cert.data);
  });

  return lines;
}

addManualTest("check WebCrypto", checkWebCrypto);
