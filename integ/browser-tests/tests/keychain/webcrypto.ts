import { type NamedDecrypter, type NamedEncrypter, type NamedSigner, type NamedVerifier, AESCBC, AESGCM, AesKeyLength, Certificate, createVerifier, EcCurve, ECDSA, generateEncryptionKey, generateSigningKey, HMAC, KeyChain, RSA, RsaModulusLength, RSAOAEP } from "@ndn/keychain";
import * as ndn_testbed_certs from "@ndn/keychain/test-fixture/ndn-testbed-certs";
import { type Signer, type Verifier, Data, digestSigning, LLVerify } from "@ndn/packet";
import { Decoder, Encoder } from "@ndn/tlv";

import { addManualTest } from "../../test-fixture/manual";

interface GenBase {
  title: string;
  err?: Error;
}

interface GenSigningKey extends GenBase {
  pvt?: Signer;
  pub?: Verifier;
  canMakeCert?: boolean;
}

async function* listSigningKeys(keyChain: KeyChain): AsyncGenerator<GenSigningKey> {
  yield {
    title: "digest",
    pvt: digestSigning,
    pub: digestSigning,
    canMakeCert: false,
  };
  for (const curve of EcCurve.Choices) {
    const gen: GenSigningKey = { title: `ECDSA ${curve}` };
    try {
      const [pvt, pub] = await generateSigningKey(keyChain, "/S", ECDSA, { curve });
      await keyChain.deleteKey(pvt.name);
      [gen.pvt, gen.pub] = [pvt, pub];
    } catch (err: unknown) {
      gen.err = err as Error;
    }
    yield gen;
  }
  for (const modulusLength of RsaModulusLength.Choices) {
    const gen: GenSigningKey = { title: `RSA ${modulusLength}` };
    try {
      const [pvt, pub] = await generateSigningKey(keyChain, "/S", RSA, { modulusLength });
      await keyChain.deleteKey(pvt.name);
      [gen.pvt, gen.pub] = [pvt, pub];
    } catch (err: unknown) {
      gen.err = err as Error;
    }
    yield gen;
  }
  {
    const gen: GenSigningKey = { title: "HMAC", canMakeCert: false };
    try {
      const [pvt, pub] = await generateSigningKey(keyChain, "/S", HMAC);
      await keyChain.deleteKey(pvt.name);
      [gen.pvt, gen.pub] = [pvt, pub];
    } catch (err: unknown) {
      gen.err = err as Error;
    }
    yield gen;
  }
}

interface GenEncryptionKey extends GenBase {
  enc?: NamedEncrypter;
  dec?: NamedDecrypter;
  aead?: boolean;
}

async function* listEncryptionKeys(keyChain: KeyChain): AsyncGenerator<GenEncryptionKey> {
  for (const length of AesKeyLength.Choices) {
    const gen: GenEncryptionKey = { title: `AES-CBC ${length}` };
    try {
      const [enc, dec] = await generateEncryptionKey(keyChain, "/E", AESCBC, { length });
      await keyChain.deleteKey(enc.name);
      [gen.enc, gen.dec] = [enc, dec];
    } catch (err: unknown) {
      gen.err = err as Error;
    }
    yield gen;
  }
  for (const length of AesKeyLength.Choices) {
    const gen: GenEncryptionKey = { title: `AES-GCM ${length}`, aead: true };
    try {
      const [enc, dec] = await generateEncryptionKey(keyChain, "/E", AESGCM, { length });
      await keyChain.deleteKey(enc.name);
      [gen.enc, gen.dec] = [enc, dec];
    } catch (err: unknown) {
      gen.err = err as Error;
    }
    yield gen;
  }
  for (const modulusLength of RsaModulusLength.Choices) {
    const gen: GenEncryptionKey = { title: `RSA-OAEP ${modulusLength}`, aead: true };
    try {
      const [enc, dec] = await generateEncryptionKey(keyChain, "/E", RSAOAEP, { modulusLength });
      await keyChain.deleteKey(enc.name);
      [gen.enc, gen.dec] = [enc, dec];
    } catch (err: unknown) {
      gen.err = err as Error;
    }
    yield gen;
  }
}

async function checkWebCrypto() {
  const lines = [] as string[];
  const run = async ({ title, err }: GenBase, f: () => Promise<void>) => {
    if (!err) {
      try { await f(); } catch (err_: unknown) { err = err_ as Error; }
    }
    lines.push(`${title}: ${err ? err.toString() : "OK"}`);
  };
  const keyChain = KeyChain.open("ae688cfd-fab7-4987-93f6-3b7a2507047b");

  for await (const gen of listSigningKeys(keyChain)) {
    await run(gen, async () => {
      const { pvt, pub, canMakeCert = true } = gen;
      if (canMakeCert) {
        const cert = await Certificate.selfSign({
          publicKey: pub as NamedVerifier.PublicKey,
          privateKey: pvt as NamedSigner.PrivateKey,
        });
        await createVerifier(cert);
      }
      let pkt = new Data("/D");
      await pvt!.sign(pkt);
      pkt = new Decoder(Encoder.encode(pkt)).decode(Data);
    });
  }

  for await (const gen of listEncryptionKeys(keyChain)) {
    await run(gen, async () => {
      const { enc, dec, aead = false } = gen;
      const plaintext = crypto.getRandomValues(new Uint8Array(125));
      const additionalData = aead ? crypto.getRandomValues(new Uint8Array(17)) : undefined;
      const encrypted = await enc!.llEncrypt({ plaintext, additionalData });
      const decrypted = await dec!.llDecrypt({ additionalData, ...encrypted });
      if (!LLVerify.timingSafeEqual(plaintext, decrypted.plaintext)) {
        throw new Error("decryption result differs");
      }
    });
  }

  let testbedRootKey: NamedVerifier.PublicKey | undefined;
  await run({ title: "import testbed root certificate" }, async () => {
    const cert = Certificate.fromData(new Decoder(ndn_testbed_certs.ROOT_V2_NDNCERT).decode(Data));
    testbedRootKey = await createVerifier(cert);
  });
  await run({ title: "import and verify testbed site certificate" }, async () => {
    const cert = Certificate.fromData(new Decoder(ndn_testbed_certs.ARIZONA_20190312).decode(Data));
    await createVerifier(cert);
    await testbedRootKey?.verify(cert.data);
  });

  return lines;
}

addManualTest("check WebCrypto", checkWebCrypto);
