import type { LLDecrypt } from "@ndn/packet";
import assert from "minimalistic-assert";

/** Initialization Vector checker. */
export abstract class IvChecker {
  constructor(public readonly ivLength: number) {
    assert(ivLength > 0);
  }

  public wrap<T extends LLDecrypt.Key>(key: T): T;
  public wrap(f: LLDecrypt): LLDecrypt;
  public wrap(arg1: LLDecrypt | LLDecrypt.Key) {
    const key = arg1 as LLDecrypt.Key;
    if (typeof key.llDecrypt === "function") {
      return this.wrapKey(key);
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
      const { plaintext } = result;
      this.check(iv, plaintext.length, ciphertext.length);
      return result;
    };
  }

  protected abstract check(iv: Uint8Array, plaintextLength: number, ciphertextLength: number): void;
}
