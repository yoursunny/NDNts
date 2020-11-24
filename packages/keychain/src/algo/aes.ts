import type { LLDecrypt, LLEncrypt } from "@ndn/packet";
import DefaultWeakMap from "mnemonist/default-weak-map.js";

import { crypto } from "../crypto_node";
import { CounterIvGen, CryptoAlgorithm, EncryptionAlgorithm, IvGen, RandomIvGen } from "../key/mod";

export interface Encryption<I, G extends GenParams> extends EncryptionAlgorithm<I, false, G> {
  readonly ivLength: number;
  makeAesKeyGenParams: (genParams: G) => AesKeyGenParams;
}

export type KeyLength = 128|192|256;
export namespace KeyLength {
  export const Default: KeyLength = 128;
  export const Choices: readonly KeyLength[] = [128, 192, 256];
}

/** Key generation parameters. */
export interface GenParams {
  length?: KeyLength;

  /** Import raw key bits instead of generating. */
  importRaw?: Uint8Array;
}
type GenParams_ = GenParams;

/** AES block size in octets. */
export const blockSize = 16;

class AesCommon<I = {}, G extends GenParams = GenParams> implements Encryption<I, G> {
  constructor(
      private readonly name: string,
      public readonly uuid: string,
      private readonly detail: AlgoDetail<I>,
  ) {
    this.keyUsages = { secret: detail.secretKeyUsages };
    this.ivLength = detail.ivLength;
  }

  public readonly keyUsages: { secret: KeyUsage[] };
  public readonly ivLength: number;

  public makeAesKeyGenParams({ length = KeyLength.Default }: G): AesKeyGenParams {
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

  private check(iv: Uint8Array|undefined, additionalData: Uint8Array|undefined) {
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

      const encrypted = new Uint8Array(await crypto.subtle.encrypt(params, secretKey, plaintext));
      const ciphertext = this.detail.tagSize > 0 ? encrypted.slice(0, -this.detail.tagSize) : encrypted;
      return {
        ciphertext,
        iv,
        authenticationTag: this.detail.tagSize > 0 ? encrypted.slice(-this.detail.tagSize) : undefined,
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
      if ((authenticationTag?.byteLength ?? 0) !== this.detail.tagSize) {
        throw new Error("bad authenticationTag");
      }

      let encrypted = ciphertext;
      if (this.detail.tagSize > 0) {
        encrypted = new Uint8Array(ciphertext.byteLength + this.detail.tagSize);
        encrypted.set(ciphertext, 0);
        encrypted.set(authenticationTag!, ciphertext.byteLength);
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

interface AlgoDetail<I> {
  secretKeyUsages: KeyUsage[];
  ivLength: number;
  getIvGen: (key: CryptoAlgorithm.SecretKey<I>) => IvGen;
  allowAdditionalData: boolean;
  tagSize: number;
  defaultInfo: I;
  modifyParams?: (params: any, info: I) => void;
}

/**
 * AES-CBC encryption algorithm.
 *
 * Initialization Vectors must be 16 octets.
 * During encryption, if IV is unspecified, it is randomly generated.
 * During decryption, quality of IV is not checked.
 */
export const CBC: Encryption<{}, GenParams> = new AesCommon("AES-CBC", "a3840ac4-b29d-4ab5-a255-2894ec254223", {
  secretKeyUsages: ["encrypt", "decrypt"],
  ivLength: 16,
  getIvGen: () => new RandomIvGen(16),
  allowAdditionalData: false,
  tagSize: 0,
  defaultInfo: {},
});

const ctrIvGen = new DefaultWeakMap<CryptoAlgorithm.SecretKey<CTR.Info>, IvGen>(
  ({ info: { counterLength } }) => {
    return new CounterIvGen({
      ivLength: CTR.ivLength,
      counterBits: counterLength,
      blockSize,
    });
  });

/**
 * AES-CTR encryption algorithm.
 *
 * Initialization Vectors must be 16 octets.
 * During encryption, if IV is unspecified, it is constructed with two parts:
 * @li a 64-bit random number, generated each time a private key instance is constructed;
 * @li a 64-bit counter starting from zero.
 *
 * During decryption, quality of IV is not automatically checked.
 * Since the security of AES-CTR depends on having unique IVs, the application is recommended to
 * check IVs using CounterIvChecker type.
 */
export const CTR: Encryption<CTR.Info, CTR.GenParams> = new AesCommon<CTR.Info, CTR.GenParams>("AES-CTR", "0ec985f2-88c0-4dd9-8b69-2c41bd639809", {
  secretKeyUsages: ["encrypt", "decrypt"],
  ivLength: 16,
  getIvGen: (key) => ctrIvGen.get(key),
  allowAdditionalData: false,
  tagSize: 0,
  defaultInfo: {
    counterLength: 64,
  },
  modifyParams: (params: Partial<AesCtrParams & AesCbcParams>, { counterLength }: CTR.Info) => {
    params.counter = params.iv;
    delete params.iv;
    params.length = counterLength;
  },
});

export namespace CTR {
  export interface Info {
    /**
     * Specify number of bits in IV to use as counter.
     * This must be between 1 and 128. Default is 64.
     */
    counterLength: number;
  }

  export type GenParams = GenParams_ & Partial<Info>;
}

const gcmIvGen = new DefaultWeakMap<CryptoAlgorithm.SecretKey<{}>, IvGen>(
  () => new CounterIvGen({
    ivLength: GCM.ivLength,
    counterBits: 32,
    blockSize,
  }));

/**
 * AES-GCM encryption algorithm.
 *
 * Initialization Vectors must be 12 octets.
 * During encryption, if IV is unspecified, it is constructed with two parts:
 * @li a 64-bit random number, generated each time a private key instance is constructed;
 * @li a 32-bit counter starting from zero.
 *
 * During decryption, quality of IV is not automatically checked.
 * Since the security of AES-CTR depends on having unique IVs, the application is recommended to
 * check IVs using CounterIvChecker type.
 */
export const GCM: Encryption<{}, GenParams> = new AesCommon("AES-GCM", "a7e27aee-2f10-4150-bd6b-5e667c006274", {
  secretKeyUsages: ["encrypt", "decrypt"],
  ivLength: 12,
  getIvGen: (key) => gcmIvGen.get(key),
  allowAdditionalData: true,
  tagSize: 128 / 8,
  defaultInfo: {},
});
