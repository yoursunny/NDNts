import type { Data } from "./data";

/** Low level encryption function. */
export type LLEncrypt = (params: LLEncrypt.Params) => Promise<LLEncrypt.Result>;

export namespace LLEncrypt {
  /** Input of LLEncrypt function. */
  export interface Params {
    plaintext: Uint8Array;
    iv?: Uint8Array;
    additionalData?: Uint8Array;
  }

  /** Output of LLEncrypt function. */
  export interface Result {
    ciphertext: Uint8Array;
    iv?: Uint8Array;
    authenticationTag?: Uint8Array;
  }

  /** Object that provides LLEncrypt function, such as secret key. */
  export interface Key {
    readonly llEncrypt: LLEncrypt;
  }
}

/** Low level decryption function. */
export type LLDecrypt = (params: LLDecrypt.Params) => Promise<LLDecrypt.Result>;

export namespace LLDecrypt {
  /** Input of LLDecrypt function. */
  export interface Params {
    ciphertext: Uint8Array;
    iv?: Uint8Array;
    authenticationTag?: Uint8Array;
    additionalData?: Uint8Array;
  }

  /** Output of LLDecrypt function. */
  export interface Result {
    plaintext: Uint8Array;
  }

  /** Object that provides LLDecrypt function, such as secret key. */
  export interface Key {
    readonly llDecrypt: LLDecrypt;
  }
}

/**
 * High level encrypter.
 *
 * This captures both the encryption key and the wire format of encrypted content.
 */
export interface Encrypter<T = Data> {
  /** Encrypt a packet. The packet is modified in-place. */
  encrypt: (pkt: T) => Promise<void>;
}

/**
 * High level decrypter.
 *
 * This captures both the decryption key and the wire format of encrypted content.
 */
export interface Decrypter<T = Data> {
  /** Decrypt a packet. The packet is modified in-place. */
  decrypt: (pkt: T) => Promise<void>;
}

/** Encrypter and decrypter that do nothing. */
export const noopEncryption: Encrypter<any>&Decrypter<any> = {
  encrypt() {
    return Promise.resolve();
  },
  decrypt() {
    return Promise.resolve();
  },
};
