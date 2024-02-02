import "@ndn/packet/test-fixture/expect";

import { CertNaming, createVerifier, CryptoAlgorithmListFull, KeyChain, SigningAlgorithmListFull } from "@ndn/keychain";
import { Data } from "@ndn/packet";
import { Decoder } from "@ndn/tlv";
import { expect, test } from "vitest";

import { SafeBag } from "..";
import { SafeBagEC, SafeBagRSA, type SafeBagTestVector } from "../test-fixture/safe-bag";

test.each<[string, SafeBagTestVector]>([
  ["EC", SafeBagEC],
  ["RSA", SafeBagRSA],
])("import %s", async (desc, { sigType, canRSAOAEP, certName, wire, passphrase }) => {
  void desc;
  const safeBag = Decoder.decode(wire, SafeBag);
  const { certificate: cert } = safeBag;
  expect(cert.name).toEqualName(certName);
  const keyName = CertNaming.toKeyName(cert.name);

  await expect(safeBag.decryptKey("wrong-passphrase")).rejects.toThrow();

  {
    const keyChain = KeyChain.createTemp(CryptoAlgorithmListFull);
    await safeBag.saveKeyPair(passphrase, keyChain);
    const pvt = await keyChain.getKey(keyName, "signer");
    expect(pvt.name).toEqualName(keyName);
    expect(pvt.sigType).toBe(sigType);
    await expect(keyChain.getKey(keyName, "decrypter")).rejects.toThrow();

    const data = new Data("/D");
    await pvt.sign(data);
    expect(data.sigInfo.type).toBe(sigType);
    const verifier = await createVerifier(cert, { algoList: SigningAlgorithmListFull });
    await verifier.verify(data);
  }

  if (canRSAOAEP) {
    const keyChain = KeyChain.createTemp(CryptoAlgorithmListFull);
    await safeBag.saveKeyPair(passphrase, keyChain, { preferRSAOAEP: true });
    const decrypter = await keyChain.getKey(keyName, "decrypter");
    expect(decrypter.name).toEqualName(keyName);
    await expect(keyChain.getKey(keyName, "signer")).rejects.toThrow();
  }
});
