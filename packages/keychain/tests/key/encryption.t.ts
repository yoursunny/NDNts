import "@ndn/packet/test-fixture/expect";

import { Component, Name } from "@ndn/packet";
import { Encoder } from "@ndn/tlv";

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
  [AES.CBC, undefined],
  [AES.CBC, { length: 256 }],
  [AES.CTR, undefined],
  [AES.CTR, { counterLength: 16, length: 192 }],
  [AES.GCM, undefined],
])("AES encrypt-decrypt %#", async (algo: EncryptionAlgorithm, genParams: any) => {
  const keyChain = KeyChain.createTemp();
  const name = new Name("/my/KEY/x");
  await generateEncryptionKey(keyChain, name, algo, genParams);

  const { encrypter, decrypter } = await keyChain.getKeyPair(name);
  await testEncryptDecrypt(encrypter, decrypter, algo === AES.GCM);
});

test.each([
  [AES.CTR, 16],
  [AES.CTR, 20],
  [AES.CTR, 24],
  [AES.GCM, 32],
])("AES CounterIvGen %#", async (algo: EncryptionAlgorithm, counterLength: number) => {
  const p0 = crypto.getRandomValues(new Uint8Array(32));
  const p1 = crypto.getRandomValues(new Uint8Array(33));
  const p2 = crypto.getRandomValues(new Uint8Array(1));

  const [encA] = await generateEncryptionKey(new Name("/A"), algo, { counterLength });
  const { iv: ivA0 } = await encA.llEncrypt({ plaintext: p0 });
  const { iv: ivA1 } = await encA.llEncrypt({ plaintext: p1 });
  const { iv: ivA2 } = await encA.llEncrypt({ plaintext: p2 });
  const [encB] = await generateEncryptionKey(new Name("/B"), algo, { counterLength });
  const { iv: ivB0 } = await encB.llEncrypt({ plaintext: p0 });
  const { iv: ivB1 } = await encB.llEncrypt({ plaintext: p1 });
  const { iv: ivB2 } = await encB.llEncrypt({ plaintext: p2 });

  const ivLength = algo === AES.CTR ? 16 : 12;
  const counterMask = Number.parseInt("1".repeat(counterLength), 2);
  const parseIv = (iv: Uint8Array): [Uint8Array, number] => {
    expect(iv).toHaveLength(ivLength);
    const u32 = Encoder.asDataView(iv).getUint32(ivLength - 4);
    const counter = u32 & counterMask;
    const fixed = Uint8Array.from(iv);
    Encoder.asDataView(fixed).setUint32(ivLength - 4, u32 & ~counterMask);
    return [fixed, counter];
  };

  const [fA0, cntA0] = parseIv(ivA0!);
  const [fA1, cntA1] = parseIv(ivA1!);
  const [fA2, cntA2] = parseIv(ivA2!);
  const [fB0, cntB0] = parseIv(ivB0!);
  const [fB1, cntB1] = parseIv(ivB1!);
  const [fB2, cntB2] = parseIv(ivB2!);

  expect(fA1).toEqualUint8Array(fA0);
  expect(fA2).toEqualUint8Array(fA0);
  expect(fB0).not.toEqualUint8Array(fA0);
  expect(fB1).toEqualUint8Array(fB0);
  expect(fB2).toEqualUint8Array(fB0);

  const sub32 = (a: number, b: number) => {
    let diff = b - a;
    if (diff < 0) {
      diff += 1 << 32;
    }
    return diff;
  };
  expect(sub32(cntA0, cntA1)).toBe(2);
  expect(sub32(cntA1, cntA2)).toBe(3);
  expect(sub32(cntB0, cntB1)).toBe(2);
  expect(sub32(cntB1, cntB2)).toBe(3);
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
