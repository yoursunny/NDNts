import { SigType, Verifier } from "@ndn/packet";
import { toHex } from "@ndn/tlv";
import type * as asn1 from "@yoursunny/asn1";

import { crypto } from "../crypto_node";
import type { CryptoAlgorithm, SigningAlgorithm } from "../types";

const ImportParams: RsaHashedImportParams = {
  name: "RSASSA-PKCS1-v1_5",
  hash: "SHA-256",
};

function makeGenParams(modulusLength: RsaModulusLength): RsaHashedKeyGenParams {
  return {
    ...ImportParams,
    publicExponent: Uint8Array.of(0x01, 0x00, 0x01),
    modulusLength,
  };
}

export type RsaModulusLength = 2048|4096;

export namespace RsaModulusLength {
  export const Default: RsaModulusLength = 2048;
  export const Choices: readonly RsaModulusLength[] = [2048, 4096];
}

export const RSA: SigningAlgorithm<{}, true, RSA.GenParams> = {
  uuid: "771b4ccd-3e8d-4ad5-9422-248f18c6fcb5",
  sigType: SigType.Sha256WithRsa,
  privateKeyUsages: ["sign"],
  publicKeyUsages: ["verify"],

  async cryptoGenerate({ modulusLength = RsaModulusLength.Default, importPkcs8 }: RSA.GenParams, extractable: boolean) {
    let pair: CryptoKeyPair;
    if (importPkcs8) {
      const [pkcs8, spki] = importPkcs8;
      const [privateKey, publicKey] = await Promise.all([
        crypto.subtle.importKey("pkcs8", pkcs8, ImportParams, extractable, [...this.privateKeyUsages!]),
        crypto.subtle.importKey("spki", spki, ImportParams, true, [...this.publicKeyUsages!]),
      ]);
      pair = { privateKey, publicKey };
    } else {
      const params = makeGenParams(modulusLength);
      pair = await crypto.subtle.generateKey(params, extractable,
        [...this.privateKeyUsages!, ...this.publicKeyUsages!]) as CryptoKeyPair;
    }

    const spki = new Uint8Array(await crypto.subtle.exportKey("spki", pair.publicKey));
    return {
      ...pair,
      jwkImportParams: ImportParams,
      spki,
      info: {},
    };
  },

  async importSpki(spki: Uint8Array, der: asn1.ElementBuffer) {
    // SubjectPublicKeyInfo.algorithm.algorithm == 1.2.840.113549.1.1.1
    const algo = der.children?.[0].children?.[0];
    if (!(algo && algo.type === 0x06 && algo.value && toHex(algo.value) === "2A864886F70D010101")) {
      throw new Error("not RSA key");
    }
    const key = await crypto.subtle.importKey("spki", spki, ImportParams, true, [...this.publicKeyUsages!]);
    return {
      publicKey: key,
      spki,
      info: {},
    };
  },

  makeLLSign({ privateKey }: CryptoAlgorithm.PrivateKey<{}>) {
    return async (input) => {
      const raw = await crypto.subtle.sign(ImportParams.name, privateKey, input);
      return new Uint8Array(raw);
    };
  },

  makeLLVerify({ publicKey }: CryptoAlgorithm.PublicKey<{}>) {
    return async (input, sig) => {
      const ok = await crypto.subtle.verify(ImportParams.name, publicKey, sig, input);
      Verifier.throwOnBadSig(ok);
    };
  },
};

export namespace RSA {
  export interface GenParams {
    modulusLength?: RsaModulusLength;

    /** Import PKCS#8 private key and SPKI public key instead of generating. */
    importPkcs8?: [Uint8Array, Uint8Array];
  }
}
