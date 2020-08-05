import "@ndn/packet/test-fixture/expect";

import { Component, Name } from "@ndn/packet";

import { AES, Certificate, EncryptionAlgorithm, generateEncryptionKey, generateSigningKey, KeyChain, KeyChainImplWebCrypto as crypto, NamedDecrypter, NamedEncrypter, RSAOAEP, ValidityPeriod } from "../..";

async function testEncryptDecrypt(encrypter: NamedEncrypter, decrypter: NamedDecrypter, aead: boolean) {
  expect(encrypter.name).toEqualName(decrypter.name);

  const plaintext = crypto.getRandomValues(new Uint8Array(128));
  const additionalData = crypto.getRandomValues(new Uint8Array(16));

  {
    const encrypted = await encrypter.llEncrypt({ plaintext });
    const decrypted = await decrypter.llDecrypt(encrypted);
    expect(decrypted.plaintext).toEqualUint8Array(plaintext);
  }

  if (aead) {
    const encrypted = await encrypter.llEncrypt({
      plaintext,
      additionalData,
    });
    const decrypted = await decrypter.llDecrypt({
      ...encrypted,
      additionalData,
    });
    expect(decrypted.plaintext).toEqualUint8Array(plaintext);
  } else {
    await expect(encrypter.llEncrypt({
      plaintext,
      additionalData,
    })).rejects.toThrow();
  }
}

test.each([
  [AES.CBC, undefined],
  [AES.CBC, { length: 256 }],
  [AES.CTR, undefined],
  [AES.CTR, { counterLength: 1, length: 192 }],
  [AES.GCM, undefined],
])("AES encrypt-decrypt %#", async (algo: EncryptionAlgorithm, genParams: any) => {
  const keyChain = KeyChain.createTemp();
  const name = new Name("/my/KEY/x");
  await generateEncryptionKey(keyChain, name, algo, genParams);

  const { encrypter, decrypter } = await keyChain.getKeyPair(name);
  await testEncryptDecrypt(encrypter, decrypter, algo === AES.GCM);
});

test("RSA-OAEP encrypt-decrypt", async () => {
  const keyChain = KeyChain.createTemp();
  const name = new Name("/my/KEY/x");
  await generateEncryptionKey(keyChain, name, RSAOAEP);

  const { publicKey, decrypter } = await keyChain.getKeyPair(name);
  const [signer] = await generateSigningKey("/S");
  const cert = await Certificate.issue({
    validity: ValidityPeriod.daysFromNow(1),
    issuerId: Component.from("issuer"),
    issuerPrivateKey: signer,
    publicKey,
  });
  const encrypter = await cert.createEncrypter();
  await testEncryptDecrypt(encrypter, decrypter, true);
});
