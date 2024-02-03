import type { LLDecrypt } from "@ndn/packet";
import { assert } from "@ndn/util";

/**
 * Initialization Vector checker.
 *
 * @remarks
 * The `.wrap()` method creates an {@link LLDecrypt.Key} or {@link LLDecrypt} that checks the IV in
 * each message before and after decryption, and updates the internal state of this class.
 * Typically, a separate IvChecker instance should be used for each key.
 */
export abstract class IvChecker {
  constructor(public readonly ivLength: number) {
    assert(ivLength > 0);
  }

  public wrap<T extends LLDecrypt.Key>(key: T): T;
  public wrap(f: LLDecrypt): LLDecrypt;
  public wrap(arg1: LLDecrypt | LLDecrypt.Key) {
    if (typeof (arg1 as LLDecrypt.Key).llDecrypt === "function") {
      return this.wrapKey(arg1 as LLDecrypt.Key);
    }
    return this.wrapLLDecrypt(arg1 as LLDecrypt);
  }

  private wrapKey(key: LLDecrypt.Key): any {
    const f = this.wrapLLDecrypt((...args) => key.llDecrypt(...args));
    return new Proxy(key, {
      get(target, prop: keyof LLDecrypt.Key, receiver) {
        if (prop === "llDecrypt") {
          return f;
        }
        return Reflect.get(target, prop, receiver);
      },
    });
  }

  private wrapLLDecrypt(f: LLDecrypt): LLDecrypt {
    return async (params) => {
      const { ciphertext, iv } = params;
      if (iv?.length !== this.ivLength) {
        throw new Error("IV is missing or has wrong length");
      }
      const result = await f(params);
      this.check(iv, result.plaintext.length, ciphertext.length);
      return result;
    };
  }

  /** Check IV for incoming message and update internal state. */
  protected abstract check(iv: Uint8Array, plaintextLength: number, ciphertextLength: number): void;
}
