import "@ndn/packet/test-fixture/expect";

import { CertNaming, KeyChain } from "@ndn/keychain";
import { Data } from "@ndn/packet";
import { Decoder } from "@ndn/tlv";

import { SafeBag } from "..";
import { SafeBagEC, SafeBagRSA } from "../test-fixture/safe-bag";

test.each([
  SafeBagEC, SafeBagRSA,
])("import %#", async ({ sigType, canRSAOAEP, certName, wire, passphrase }) => {
  const safeBag = new Decoder(wire).decode(SafeBag);
  const { certificate: cert } = safeBag;
  expect(cert.name).toEqualName(certName);
  const keyName = CertNaming.toKeyName(cert.name);

  await expect(safeBag.decryptKey("wrong-passphrase")).rejects.toThrow();

  {
    const keyChain = KeyChain.createTemp();
    await safeBag.saveKeyPair(passphrase, keyChain);
    const pvt = await keyChain.getKey(keyName, "signer");
    expect(pvt.name).toEqualName(keyName);
    expect(pvt.sigType).toBe(sigType);
    await expect(keyChain.getKey(keyName, "decrypter")).rejects.toThrow();

    const data = new Data("/D");
    await pvt.sign(data);
    expect(data.sigInfo.type).toBe(sigType);
    const verifier = await cert.createVerifier();
    await verifier.verify(data);
  }

  if (canRSAOAEP) {
    const keyChain = KeyChain.createTemp();
    await safeBag.saveKeyPair(passphrase, keyChain, { preferRSAOAEP: true });
    const decrypter = await keyChain.getKey(keyName, "decrypter");
    expect(decrypter.name).toEqualName(keyName);
    await expect(keyChain.getKey(keyName, "signer")).rejects.toThrow();
  }
});
