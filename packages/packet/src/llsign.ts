export type LLSign = (input: Uint8Array) => Promise<Uint8Array>;

export namespace LLSign {
  export const OP = Symbol("LLSign.OP");

  export interface Signable {
    [OP](signer: LLSign): Promise<void>;
  }
}

export type LLVerify = (input: Uint8Array, sig: Uint8Array) => Promise<void>;

export namespace LLVerify {
  export const OP = Symbol("LLVerify.OP");

  export interface Verifiable {
    [OP](verifier: LLVerify): Promise<void>;
  }
}
