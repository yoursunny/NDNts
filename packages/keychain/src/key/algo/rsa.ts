import { LLDecrypt, LLEncrypt, LLSign, LLVerify, SigType, Verifier } from "@ndn/packet";
import { toHex } from "@ndn/tlv";
import type * as asn1 from "@yoursunny/asn1";

import { crypto } from "../crypto_node";
import type { CryptoAlgorithm, EncryptionAlgorithm, SigningAlgorithm } from "../types";

export type RsaModulusLength = 2048|4096;
export namespace RsaModulusLength {
  export const Default: RsaModulusLength = 2048;
  export const Choices: readonly RsaModulusLength[] = [2048, 4096];
}

class RsaCommon implements CryptoAlgorithm<{}, true, RSA.GenParams> {
  constructor(
      protected readonly name: string,
      public readonly uuid: string,
      public readonly keyUsages: Record<"private"|"public", KeyUsage[]>,
  ) {
    this.importParams = {
      name,
      hash: "SHA-256",
    };
    this.genParams = {
      ...this.importParams,
      publicExponent: Uint8Array.of(0x01, 0x00, 0x01),
      modulusLength: RsaModulusLength.Default,
    };
  }

  protected readonly importParams: RsaHashedImportParams;
  protected readonly genParams: RsaHashedKeyGenParams;

  async cryptoGenerate({ modulusLength = RsaModulusLength.Default, importPkcs8 }: RSA.GenParams, extractable: boolean) {
    let pair: CryptoKeyPair;
    if (importPkcs8) {
      const [pkcs8, spki] = importPkcs8;
      const [privateKey, publicKey] = await Promise.all([
        crypto.subtle.importKey("pkcs8", pkcs8, this.importParams, extractable, this.keyUsages.private),
        crypto.subtle.importKey("spki", spki, this.importParams, true, this.keyUsages.public),
      ]);
      pair = { privateKey, publicKey };
    } else {
      const genParams: RsaHashedKeyGenParams = {
        ...this.genParams,
        modulusLength,
      };
      pair = await crypto.subtle.generateKey(genParams, extractable,
        [...this.keyUsages.private, ...this.keyUsages.public]) as CryptoKeyPair;
    }

    const spki = new Uint8Array(await crypto.subtle.exportKey("spki", pair.publicKey));
    return {
      ...pair,
      jwkImportParams: this.importParams,
      spki,
      info: {},
    };
  }

  public async importSpki(spki: Uint8Array, der: asn1.ElementBuffer) {
    // SubjectPublicKeyInfo.algorithm.algorithm == 1.2.840.113549.1.1.1
    const algo = der.children?.[0].children?.[0];
    if (!(algo && algo.type === 0x06 && algo.value && toHex(algo.value) === "2A864886F70D010101")) {
      throw new Error("not RSA key");
    }
    const key = await crypto.subtle.importKey(
      "spki", spki, this.importParams, true, this.keyUsages.public);
    return {
      publicKey: key,
      spki,
      info: {},
    };
  }
}

/** Sha256WithRsa signing algorithm. */
export const RSA: SigningAlgorithm<{}, true, RSA.GenParams> = new (class extends RsaCommon implements SigningAlgorithm<{}, true, RSA.GenParams> {
  constructor() {
    super("RSASSA-PKCS1-v1_5", "771b4ccd-3e8d-4ad5-9422-248f18c6fcb5",
      { private: ["sign"], public: ["verify"] });
  }

  public readonly sigType = SigType.Sha256WithRsa;

  public makeLLSign({ privateKey }: CryptoAlgorithm.PrivateKey<{}>): LLSign {
    return async (input) => {
      const raw = await crypto.subtle.sign(this.name, privateKey, input);
      return new Uint8Array(raw);
    };
  }

  public makeLLVerify({ publicKey }: CryptoAlgorithm.PublicKey<{}>): LLVerify {
    return async (input, sig) => {
      const ok = await crypto.subtle.verify(this.name, publicKey, sig, input);
      Verifier.throwOnBadSig(ok);
    };
  }
})();

export namespace RSA {
  export interface GenParams {
    modulusLength?: RsaModulusLength;

    /** Import PKCS#8 private key and SPKI public key instead of generating. */
    importPkcs8?: [Uint8Array, Uint8Array];
  }
}

/** RSA-OAEP encryption algorithm. */
export const RSAOAEP: EncryptionAlgorithm<{}, true, RSA.GenParams> = new (class extends RsaCommon implements EncryptionAlgorithm<{}, true, RSA.GenParams> {
  constructor() {
    super("RSA-OAEP", "f9c1c143-a7a5-459c-8cdf-69c5f7191cfe",
      { private: ["decrypt"], public: ["encrypt"] });
  }

  public makeLLEncrypt({ publicKey }: CryptoAlgorithm.PublicKey<{}>): LLEncrypt {
    return async ({
      plaintext,
      additionalData,
    }) => {
      const ciphertext = new Uint8Array(await crypto.subtle.encrypt({
        name: this.name,
        label: additionalData,
      }, publicKey, plaintext));
      return { ciphertext };
    };
  }

  public makeLLDecrypt({ privateKey }: CryptoAlgorithm.PrivateKey<{}>): LLDecrypt {
    return async ({
      ciphertext,
      additionalData,
    }) => {
      const plaintext = new Uint8Array(await crypto.subtle.decrypt({
        name: this.name,
        label: additionalData,
      }, privateKey, ciphertext));
      return { plaintext };
    };
  }
})();
