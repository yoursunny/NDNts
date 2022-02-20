import type { LLEncrypt } from "@ndn/packet";
import { assert } from "@ndn/util";

/** Initialization Vector generator. */
export abstract class IvGen {
  constructor(public readonly ivLength: number) {
    assert(ivLength > 0);
  }

  public wrap<T extends LLEncrypt.Key>(key: T): T;
  public wrap(f: LLEncrypt): LLEncrypt;
  public wrap(arg1: LLEncrypt | LLEncrypt.Key) {
    const key = arg1 as LLEncrypt.Key;
    if (typeof key.llEncrypt === "function") {
      return this.wrapKey(key);
    }
    return this.wrapLLEncrypt(arg1 as LLEncrypt);
  }

  private wrapKey(key: LLEncrypt.Key): any {
    const f = this.wrapLLEncrypt((...args) => key.llEncrypt(...args));
    return new Proxy(key, {
      get(target, prop: keyof LLEncrypt.Key, receiver) {
        if (prop === "llEncrypt") {
          return f;
        }
        return Reflect.get(target, prop, receiver);
      },
    });
  }

  private wrapLLEncrypt(f: LLEncrypt): LLEncrypt {
    return async (params) => {
      if (params.iv) {
        return f(params);
      }
      params.iv = this.generate();
      const result = await f(params);
      this.update(params.plaintext.length, result.ciphertext.length);
      return result;
    };
  }

  protected abstract generate(): Uint8Array;

  protected update(plaintextLength: number, ciphertextLength: number): void {
    //
  }
}
