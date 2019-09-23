import { Encodable, Encoder } from "@ndn/tlv";

interface StoredSig {
  /** Signed portion, saved during decoding or signing. */
  [LLSign.SIGNED]?: Uint8Array;
  /** TLV-VALUE of SignatureValue. */
  sigValue: Uint8Array;
}

/**
 * Low-level signing function.
 * This function only concerns about crypto, not naming or policy.
 * It resolves the Promise with raw signature.
 */
export type LLSign = (input: Uint8Array) => Promise<Uint8Array>;

export namespace LLSign {
  export const SIGNED = Symbol("LLSign.SIGNED");
  export const GetSignedPortion = Symbol("LLSign.GetSignedPortion");

  export type Signable = StoredSig & {
    /** Retrieve portion of packet to be covered by signature. */
    [GetSignedPortion]: () => Encodable|Encodable[];
  };

  /** Call signing function and store signature. */
  export async function call(sign: LLSign, obj: Signable): Promise<void> {
    const input = Encoder.encode(obj[GetSignedPortion]());
    obj.sigValue = await sign(input);
    obj[SIGNED] = input;
  }
}

/**
 * Low-level verification function.
 * This function only concerns about crypto, not naming or policy.
 * It resolves the Promise if verification succeeds, and rejects the Promise
 * with an Error if verification fails.
 */
export type LLVerify = (input: Uint8Array, sig: Uint8Array) => Promise<void>;

export namespace LLVerify {
  export type Verifiable = Readonly<StoredSig>;

  /** Call verification function on existing signed portion and signature. */
  export async function call(verify: LLVerify, obj: Verifiable): Promise<void> {
    const input = obj[LLSign.SIGNED];
    if (typeof input === "undefined") {
      return Promise.reject(new Error("signed portion is empty"));
    }
    return verify(input, obj.sigValue);
  }

  /** An error to indicate signature is incorrect. */
  export const BAD_SIG = new Error("incorrect signature value");
}
