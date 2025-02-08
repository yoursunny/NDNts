import "@ndn/packet/test-fixture/expect";

import { createVerifier, KeyChain, SigningAlgorithmListFull } from "@ndn/keychain";
import { Data } from "@ndn/packet";
import { expect, test } from "vitest";

import { parseCert, parseKey } from "..";
import * as pem_files from "../test-fixture/pem-files";

test.each<[string, () => Promise<pem_files.PemTestVector>]>([
  ["Ed", pem_files.Ed25519],
  ["RSA 2048", pem_files.RSA_2048],
  ["RSA 4096", pem_files.RSA_4096],
  ["EC P256", pem_files.EC_P256],
  ["EC P384", pem_files.EC_P384],
  ["EC P521", pem_files.EC_P521],
])("parse %s", async (desc, loader) => {
  void desc;
  const { sigType, keyName, certName, validity, keyPem, certPem } = await loader();

  const key = parseKey(keyPem);
  expect(key.keyName).toEqualName(keyName);
  expect(key.sigType).toBe(sigType);

  const cert = parseCert(certPem);
  expect(cert).toHaveName(certName);
  expect(cert.validity.equals(validity)).toBeTruthy();

  const keyChain = KeyChain.createTemp(SigningAlgorithmListFull);
  key.cert = cert;
  await key.saveKeyPair(keyChain);

  const signer = await keyChain.getSigner(keyName);
  const data = new Data("/D");
  await signer.sign(data);
  expect(data.sigInfo.type).toBe(sigType);
  expect(data.sigInfo.keyLocator).toHaveName(certName);

  const verifier = await createVerifier(cert, { algoList: SigningAlgorithmListFull });
  await verifier.verify(data);
});

test("UnencryptedPrivateKey", async () => {
  const ec256 = await pem_files.EC_P256();
  const ec384 = await pem_files.EC_P384();

  const key256 = parseKey(ec256.keyPem);
  expect(key256.cert).toBeUndefined();

  const cert384 = parseCert(ec384.certPem);
  expect(() => key256.cert = cert384).toThrow(/mismatch/);

  const cert256 = parseCert(ec256.certPem);
  key256.cert = cert256;
  expect(key256.cert).toBe(cert256);
});
