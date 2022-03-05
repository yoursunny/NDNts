import type { LLEncrypt } from "@ndn/packet";
import { assert } from "@ndn/util";

/**
 * Initialization Vector generator.
 *
 * The .wrap() method creates an LLEncrypt.Key or LLEncrypt that generates an IV for each message
 * before encryption, and updates the internal state of this class after encryption. Typically, a
 * separate IVGen instance should be used for each key.
 *
 * If a message passed for encryption already has an IV associated, it would bypass this class: in
 * that case, the IV is not checked and the internal state is not updated.
 */
export abstract class IvGen {
  constructor(public readonly ivLength: number) {
    assert(ivLength > 0);
  }

  public wrap<T extends LLEncrypt.Key>(key: T): T;
  public wrap(f: LLEncrypt): LLEncrypt;
  public wrap(arg1: LLEncrypt | LLEncrypt.Key) {
    if (typeof (arg1 as LLEncrypt.Key).llEncrypt === "function") {
      return this.wrapKey(arg1 as LLEncrypt.Key);
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

  /** Generate IV for next message. */
  protected abstract generate(): Uint8Array;

  /** Update internal state after a message is encrypted.. */
  protected update(plaintextLength: number, ciphertextLength: number): void {
    void plaintextLength;
    void ciphertextLength;
  }
}
