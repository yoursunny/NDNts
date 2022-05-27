import { crypto, toHex } from "@ndn/util";
import type * as asn1 from "@yoursunny/asn1";

import type { CryptoAlgorithm } from "../key/mod";
import type { RSA } from "./rsa";

export type RsaModulusLength = 2048 | 4096;
export namespace RsaModulusLength {
  export const Default: RsaModulusLength = 2048;
  export const Choices: readonly RsaModulusLength[] = [2048, 4096];
}

export class RsaCommon implements CryptoAlgorithm<{}, true, RSA.GenParams> {
  constructor(
      protected readonly name: string,
      public readonly uuid: string,
      public readonly keyUsages: Record<"private" | "public", KeyUsage[]>,
      hash: AlgorithmIdentifier = "SHA-256",
  ) {
    this.importParams = { name, hash };
    this.genParams = {
      ...this.importParams,
      publicExponent: Uint8Array.of(0x01, 0x00, 0x01),
      modulusLength: RsaModulusLength.Default,
    };
  }

  protected readonly importParams: RsaHashedImportParams;
  protected readonly genParams: RsaHashedKeyGenParams;

  async cryptoGenerate({ modulusLength = RsaModulusLength.Default, importPkcs8 }: RSA.GenParams, extractable: boolean) {
    let privateKey: CryptoKey;
    let publicKey: CryptoKey;
    if (importPkcs8) {
      const [pkcs8, spki] = importPkcs8;
      [privateKey, publicKey] = await Promise.all([
        crypto.subtle.importKey("pkcs8", pkcs8, this.importParams, extractable, this.keyUsages.private),
        crypto.subtle.importKey("spki", spki, this.importParams, true, this.keyUsages.public),
      ]);
    } else {
      const genParams: RsaHashedKeyGenParams = {
        ...this.genParams,
        modulusLength,
      };
      ({ privateKey, publicKey } = await crypto.subtle.generateKey(genParams, extractable,
        [...this.keyUsages.private, ...this.keyUsages.public]));
    }

    const spki = new Uint8Array(await crypto.subtle.exportKey("spki", publicKey));
    return {
      privateKey,
      publicKey,
      jwkImportParams: this.importParams,
      spki,
      info: {},
    };
  }

  public async importSpki(spki: Uint8Array, der: asn1.ElementBuffer) {
    // SubjectPublicKeyInfo.algorithm.algorithm == 1.2.840.113549.1.1.1
    const algo = der.children?.[0]?.children?.[0];
    if (!(algo?.type === 0x06 && algo.value && toHex(algo.value) === "2A864886F70D010101")) {
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
