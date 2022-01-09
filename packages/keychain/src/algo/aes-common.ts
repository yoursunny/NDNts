import type { LLDecrypt, LLEncrypt } from "@ndn/packet";

import { crypto } from "../crypto_node";
import type { IvGen } from "../iv/mod";
import type { CryptoAlgorithm, EncryptionAlgorithm } from "../key/mod";

export interface AesEncryption<I, G extends AesGenParams> extends EncryptionAlgorithm<I, false, G> {
  readonly ivLength: number;
  makeAesKeyGenParams: (genParams: G) => AesKeyGenParams;
}

export type AesKeyLength = 128 | 192 | 256;
export namespace AesKeyLength {
  export const Default: AesKeyLength = 128;
  export const Choices: readonly AesKeyLength[] = [128, 192, 256];
}

/** Key generation parameters. */
export interface AesGenParams {
  length?: AesKeyLength;

  /** Import raw key bits instead of generating. */
  importRaw?: Uint8Array;
}

/** AES block size in octets. */
export const AesBlockSize = 16;

export class AesCommon<I, G extends AesGenParams> implements AesEncryption<I, G> {
  constructor(
      private readonly name: string,
      public readonly uuid: string,
      private readonly detail: AesCommon.AlgoDetail<I>,
  ) {
    this.keyUsages = { secret: detail.secretKeyUsages };
    this.ivLength = detail.ivLength;
  }

  public readonly keyUsages: { secret: KeyUsage[] };
  public readonly ivLength: number;

  public makeAesKeyGenParams({ length = AesKeyLength.Default }: G): AesKeyGenParams {
    return {
      name: this.name,
      length,
    };
  }

  public async cryptoGenerate(genParams: G, extractable: boolean): Promise<CryptoAlgorithm.GeneratedSecretKey<I>> {
    let secretKey: CryptoKey;
    if (genParams.importRaw) {
      secretKey = await crypto.subtle.importKey("raw", genParams.importRaw,
        this.name, extractable, this.keyUsages.secret);
    } else {
      secretKey = await crypto.subtle.generateKey(this.makeAesKeyGenParams(genParams),
        extractable, this.keyUsages.secret);
    }

    const info: any = Object.fromEntries(
      Object.entries(this.detail.defaultInfo)
        .map(([key, dflt]) => [key, (genParams as any)[key] ?? dflt]));

    return {
      secretKey,
      jwkImportParams: this.name,
      info,
    };
  }

  private check(iv: Uint8Array | undefined, additionalData: Uint8Array | undefined) {
    if (iv?.byteLength !== this.detail.ivLength) {
      throw new Error("bad IV");
    }

    if (additionalData && !this.detail.allowAdditionalData) {
      throw new Error("cannot use additionalData");
    }
  }

  public makeLLEncrypt(key: CryptoAlgorithm.SecretKey<I>): LLEncrypt {
    const { secretKey, info } = key;
    return this.detail.getIvGen(key).wrap(async ({
      plaintext,
      iv,
      additionalData,
    }) => {
      this.check(iv, additionalData);
      const params = {
        name: this.name,
        iv,
        additionalData,
      };
      this.detail.modifyParams?.(params, info);

      const encrypted = await crypto.subtle.encrypt(params, secretKey, plaintext);
      return {
        ciphertext: new Uint8Array(encrypted, 0, encrypted.byteLength - this.detail.tagSize),
        iv,
        authenticationTag: this.detail.tagSize > 0 ? new Uint8Array(encrypted, encrypted.byteLength - this.detail.tagSize) : undefined,
      };
    });
  }

  public makeLLDecrypt({ secretKey, info }: CryptoAlgorithm.SecretKey<I>): LLDecrypt {
    return async ({
      ciphertext,
      iv,
      authenticationTag,
      additionalData,
    }) => {
      this.check(iv, additionalData);
      if ((authenticationTag?.length ?? 0) !== this.detail.tagSize) {
        throw new Error("bad authenticationTag");
      }

      let encrypted = ciphertext;
      if (this.detail.tagSize > 0) {
        encrypted = new Uint8Array(ciphertext.length + this.detail.tagSize);
        encrypted.set(ciphertext, 0);
        encrypted.set(authenticationTag!, ciphertext.length);
      }

      const params = {
        name: this.name,
        iv,
        additionalData,
      };
      this.detail.modifyParams?.(params, info);
      const plaintext = new Uint8Array(await crypto.subtle.decrypt(params, secretKey, encrypted));
      return { plaintext };
    };
  }
}

export namespace AesCommon {
  export interface AlgoDetail<I> {
    secretKeyUsages: KeyUsage[];
    ivLength: number;
    getIvGen: (key: CryptoAlgorithm.SecretKey<I>) => IvGen;
    allowAdditionalData: boolean;
    tagSize: number;
    defaultInfo: I;
    modifyParams?: (params: any, info: I) => void;
  }
}
