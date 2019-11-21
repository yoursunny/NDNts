/**
 * Low-level signing function.
 * This function only concerns about crypto, not naming or policy.
 * It resolves the Promise with raw signature.
 */
export type LLSign = (input: Uint8Array) => Promise<Uint8Array>;

export namespace LLSign {
  export const PENDING = Symbol("LLSign.PENDING");
  export const PROCESS = Symbol("LLSign.PROCESS");

  export interface Signable {
    /** Pending signing operation to be processed prior to encoding. */
    [PENDING]?: LLSign;
    /** Process pending signing operation. */
    [PROCESS](): Promise<void>;
  }

  /**
   * Throw an error if there is a pending signing operation.
   * This should be invoked in full packet encoding function.
   */
  export function encodeErrorIfPending(obj: Signable) {
    if (typeof obj[PENDING] !== "undefined") {
      throw new Error("cannot encode due to pending signing operation");
    }
  }

  /**
   * Process pending signing operation, if any.
   * @param obj packet object that implements signable interface.
   * @param getSignedPortion callback to obtain signed portion.
   * @param setSigValue callback to store signature; if returning Promise, it will be await-ed.
   */
  export async function processImpl(obj: Signable, getSignedPortion: () => Uint8Array,
                                    setSigValue: (sig: Uint8Array) => void): Promise<void> {
    const sign = obj[PENDING];
    if (typeof sign === "undefined") {
      return;
    }
    const input = getSignedPortion();
    const sig = await sign(input);
    obj[PENDING] = undefined;
    await Promise.resolve(setSigValue(sig));
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
  export const SIGNED = Symbol("LLVerify.SIGNED");
  export const VERIFY = Symbol("LLVerify.VERIFY");

  export interface Verifiable {
    /** Signed portion stored during decoding. */
    [SIGNED]?: Uint8Array;
    /** Verify packet using given verification function. */
    [VERIFY](verify: LLVerify): Promise<void>;
  }

  /** Perform verification. */
  export function verifyImpl(obj: Verifiable, sig: Uint8Array, verify: LLVerify): Promise<void> {
    const signed = obj[LLVerify.SIGNED];
    if (typeof signed === "undefined") {
      return Promise.reject(new Error("signed portion is empty"));
    }
    return verify(signed, sig);
  }
}
