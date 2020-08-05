/** Low level encryption function. */
export type LLEncrypt = (params: LLEncrypt.Params) => Promise<LLEncrypt.Result>;

export namespace LLEncrypt {
  export interface Params {
    plaintext: Uint8Array;
    iv?: Uint8Array;
    additionalData?: Uint8Array;
  }

  export interface Result {
    ciphertext: Uint8Array;
    iv?: Uint8Array;
    authenticationTag?: Uint8Array;
  }
}

/** Low level decryption function. */
export type LLDecrypt = (params: LLDecrypt.Params) => Promise<LLDecrypt.Result>;

export namespace LLDecrypt {
  export interface Params {
    ciphertext: Uint8Array;
    iv?: Uint8Array;
    authenticationTag?: Uint8Array;
    additionalData?: Uint8Array;
  }

  export interface Result {
    plaintext: Uint8Array;
  }
}

/** Middle level encrypter, such as a secret key. */
export interface Encrypter {
  readonly llEncrypt: LLEncrypt;
}

/** Middle level decrypter, such as a secret key. */
export interface Decrypter {
  readonly llDecrypt: LLDecrypt;
}
