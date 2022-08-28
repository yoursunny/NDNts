import type { LLDecrypt, LLEncrypt } from "@ndn/packet";
import { crypto } from "@ndn/util";

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

export abstract class AesCommon<I extends {}, G extends AesGenParams> implements AesEncryption<I, G> {
  protected abstract readonly name: string;
  public abstract readonly uuid: string;
  public readonly keyUsages = { secret: ["encrypt", "decrypt"] } as const;

  public abstract readonly ivLength: number;
  protected abstract getIvGen(key: CryptoAlgorithm.SecretKey<I>): IvGen;

  protected abstract allowAdditionalData: boolean;
  protected abstract tagSize: number;
  protected abstract defaultInfo: I;

  protected modifyParams(params: any, info: I): void {
    void params;
    void info;
  }

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
      Object.entries(this.defaultInfo)
        .map(([key, dflt]) => [key, (genParams as any)[key] ?? dflt]));

    return {
      secretKey,
      jwkImportParams: this.name,
      info,
    };
  }

  private check(iv: Uint8Array | undefined, additionalData: Uint8Array | undefined) {
    if (iv?.byteLength !== this.ivLength) {
      throw new Error("bad IV");
    }

    if (additionalData && !this.allowAdditionalData) {
      throw new Error("cannot use additionalData");
    }
  }

  public makeLLEncrypt(key: CryptoAlgorithm.SecretKey<I>): LLEncrypt {
    const { secretKey, info } = key;
    return this.getIvGen(key).wrap(async ({
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
      this.modifyParams(params, info);

      const encrypted = await crypto.subtle.encrypt(params, secretKey, plaintext);
      return {
        ciphertext: new Uint8Array(encrypted, 0, encrypted.byteLength - this.tagSize),
        iv,
        authenticationTag: this.tagSize > 0 ? new Uint8Array(encrypted, encrypted.byteLength - this.tagSize) : undefined,
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
      if ((authenticationTag?.length ?? 0) !== this.tagSize) {
        throw new Error("bad authenticationTag");
      }

      let encrypted = ciphertext;
      if (this.tagSize > 0) {
        encrypted = new Uint8Array(ciphertext.length + this.tagSize);
        encrypted.set(ciphertext, 0);
        encrypted.set(authenticationTag!, ciphertext.length);
      }

      const params = {
        name: this.name,
        iv,
        additionalData,
      };
      this.modifyParams(params, info);
      const plaintext = new Uint8Array(await crypto.subtle.decrypt(params, secretKey, encrypted));
      return { plaintext };
    };
  }
}
