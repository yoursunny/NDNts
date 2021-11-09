import "@ndn/packet/test-fixture/expect";

import { Component, Name } from "@ndn/packet";

import { AesBlockSize, AESCBC, AESCTR, AESGCM, Certificate, CounterIvChecker, createEncrypter, EncryptionAlgorithm, EncryptionAlgorithmListFull, generateEncryptionKey, generateSigningKey, KeyChain, KeyChainImplWebCrypto as crypto, NamedDecrypter, NamedEncrypter, RSAOAEP, ValidityPeriod } from "../..";

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

    await expect(decrypter.llDecrypt({
      ...encrypted,
      additionalData: new Uint8Array(2), // different additionalData
    })).rejects.toThrow();
  } else {
    await expect(encrypter.llEncrypt({
      plaintext,
      additionalData,
    })).rejects.toThrow();
  }
}

test.each([
  [AESCBC, undefined],
  [AESCBC, { length: 256 }],
  [AESCTR, undefined],
  [AESCTR, { counterLength: 16, length: 192 }],
  [AESGCM, undefined],
])("AES encrypt-decrypt $#", async (algo: EncryptionAlgorithm, genParams: any) => {
  const keyChain = KeyChain.createTemp(EncryptionAlgorithmListFull);
  const name = new Name("/my/KEY/x");
  await generateEncryptionKey(keyChain, name, algo, genParams);

  const { encrypter, decrypter } = await keyChain.getKeyPair(name);
  await testEncryptDecrypt(encrypter, decrypter, algo === AESGCM);
});

test.each([
  [AESCTR, 16],
  [AESCTR, 20],
  [AESCTR, 24],
  [AESGCM, 32],
])("AES CounterIvGen $#", async (algo: EncryptionAlgorithm, counterLength: number) => {
  const p0 = crypto.getRandomValues(new Uint8Array(32));
  const p1 = crypto.getRandomValues(new Uint8Array(33));
  const p2 = crypto.getRandomValues(new Uint8Array(1));

  const [encA, decA] = await generateEncryptionKey(new Name("/A"), algo, { counterLength });
  const cA0 = await encA.llEncrypt({ plaintext: p0 });
  const cA1 = await encA.llEncrypt({ plaintext: p1 });
  const cA2 = await encA.llEncrypt({ plaintext: p2 });
  const [encB, decB] = await generateEncryptionKey(new Name("/B"), algo, { counterLength });
  const cB0 = await encB.llEncrypt({ plaintext: p0 });
  const cB1 = await encB.llEncrypt({ plaintext: p1 });
  const cB2 = await encB.llEncrypt({ plaintext: p2 });

  const ivChk = new CounterIvChecker({
    ivLength: algo === AESCTR ? 16 : 12,
    counterBits: counterLength,
    blockSize: AesBlockSize,
    requireSameRandom: true,
  });

  const extractA0 = ivChk.extract(cA0.iv!);
  expect(extractA0).toMatchObject({
    fixed: 0n,
    counter: 0n,
  });
  expect(ivChk.extract(cA1.iv!)).toMatchObject({
    fixed: 0n,
    random: extractA0.random,
    counter: 2n,
  });
  expect(ivChk.extract(cA2.iv!)).toMatchObject({
    fixed: 0n,
    random: extractA0.random,
    counter: 5n,
  });

  const extractB0 = ivChk.extract(cB0.iv!);
  expect(extractB0).toMatchObject({
    fixed: 0n,
    counter: 0n,
  });
  expect(extractB0.random).not.toBe(extractA0.random);
  expect(ivChk.extract(cB1.iv!)).toMatchObject({
    fixed: 0n,
    random: extractB0.random,
    counter: 2n,
  });
  expect(ivChk.extract(cB2.iv!)).toMatchObject({
    fixed: 0n,
    random: extractB0.random,
    counter: 5n,
  });

  const dA = ivChk.wrap(decA);
  const decryptB = ivChk.wrap(decB.llDecrypt.bind(decB));
  await expect(dA.llDecrypt(cA0)).resolves.toBeDefined();
  await expect(decryptB(cB1)).rejects.toThrow(); // wrong random bits
  await expect(dA.llDecrypt(cA2)).resolves.toBeDefined();
  await expect(dA.llDecrypt(cA1)).rejects.toThrow(); // counter not increasing
});

test("RSA-OAEP encrypt-decrypt", async () => {
  const keyChain = KeyChain.createTemp(EncryptionAlgorithmListFull);
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
  const encrypter = await createEncrypter(cert, EncryptionAlgorithmListFull);
  await testEncryptDecrypt(encrypter, decrypter, true);
});
