import type { LLEncrypt } from "@ndn/packet";
import { fromHex, toHex } from "@ndn/tlv";
import assert from "minimalistic-assert";

import { crypto } from "./crypto_node";

/** Initialization Vector generator. */
export abstract class IvGen {
  constructor(public readonly ivLength: number) {
    assert(ivLength > 0);
  }

  public wrap<T extends LLEncrypt.Key>(key: T): T;
  public wrap(f: LLEncrypt): LLEncrypt;
  public wrap(arg1: LLEncrypt|LLEncrypt.Key) {
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

/** IV generator using all random bits. */
export class RandomIvGen extends IvGen {
  protected generate() {
    return crypto.getRandomValues(new Uint8Array(this.ivLength));
  }
}

/**
 * IV generator using a counter.
 *
 * Generated IV has three parts:
 * @li fixed bits, specified in options.
 * @li random bits, different for each key.
 * @li counter bits, start from zero and incremented for each plaintext block.
 */
export class CounterIvGen extends IvGen {
  constructor({
    ivLength,
    fixedBits = 0,
    fixed: fixedInput = new Uint8Array(),
    counterBits,
    blockSize,
  }: CounterIvGen.Options) {
    super(ivLength);
    assert(fixedBits >= 0);
    assert(fixedInput.byteLength * 8 >= fixedBits);
    assert(counterBits > 0);
    assert(blockSize > 0);

    const ivBits = this.ivLength * 8;
    const randomBits = ivBits - fixedBits - counterBits;
    assert(randomBits >= 0);

    if (fixedBits > 0) {
      let fixed = BigInt(`0x${toHex(fixedInput)}`);
      fixed <<= BigInt(randomBits + counterBits);
      fixed &= BigInt(`0b${"1".repeat(fixedBits)}${"0".repeat(randomBits + counterBits)}`);
      this.iv = fixed;
    }

    if (randomBits > 0) {
      const randomBytes = crypto.getRandomValues(new Uint8Array(ivLength));
      let random = BigInt(`0x${toHex(randomBytes)}`);
      random &= BigInt(`0b${"1".repeat(randomBits)}${"0".repeat(counterBits)}`);
      this.iv |= random;
    }

    this.counterMask = BigInt(`0b${"1".repeat(counterBits)}`);

    this.blockSize = blockSize;
  }

  private iv = BigInt(0);
  private readonly counterMask: bigint;
  private readonly blockSize: number;

  protected generate() {
    return fromHex(this.iv.toString(16).padStart(2 * this.ivLength, "0"));
  }

  protected update(plaintextLength: number, ciphertextLength: number) {
    let counter = this.iv & this.counterMask;
    counter += BigInt(Math.ceil(ciphertextLength / this.blockSize));
    counter &= this.counterMask;

    this.iv &= ~this.counterMask;
    this.iv |= counter;
  }
}

export namespace CounterIvGen {
  export interface Options {
    ivLength: number;
    fixedBits?: number;
    fixed?: Uint8Array;
    counterBits: number;
    blockSize: number;
  }
}
