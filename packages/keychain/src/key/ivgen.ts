import type { LLDecrypt, LLEncrypt } from "@ndn/packet";
import { fromHex, toHex } from "@ndn/tlv";
import assert from "minimalistic-assert";

import { crypto } from "../crypto_node";

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

/** IV generator using all random bits. */
export class RandomIvGen extends IvGen {
  protected generate() {
    return crypto.getRandomValues(new Uint8Array(this.ivLength));
  }
}

/**
 * Options for Initialization Vectors using fixed+random+counter structure.
 *
 * IVs following this construction method have three parts:
 * @li fixed bits, specified in options.
 * @li random bits, different for each key and in each session.
 * @li counter bits, monotonically increasing for each plaintext/ciphertext block.
 */
export interface CounterIvOptions {
  /** IV length in octets. */
  ivLength: number;

  /**
   * Number of fixed bits.
   * @default 0
   */
  fixedBits?: number;

  /**
   * Fixed portion.
   * Required if fixedBits is positive.
   * This may be specified as a bigint or a Uint8Array.
   * If it's a Uint8Array, it must have fixedBits bits.
   * The least significant bits are taken.
   */
  fixed?: bigint | Uint8Array;

  /** Number of counter bits. */
  counterBits: number;

  /**
   * Crypto algorithm block size in octets.
   * If plaintext and ciphertext have different lengths, the longer length is considered.
   */
  blockSize: number;
}

function parseCounterIvOptions({
  ivLength,
  fixedBits = 0,
  fixed: fixedInput,
  counterBits,
}: CounterIvOptions): {
      ivBits: number;
      fixedBits: number;
      fixedMask: bigint;
      fixed: bigint;
      randomBits: number;
      randomMask: bigint;
      random: bigint;
      counterMask: bigint;
      maxCounter: bigint;
    } {
  assert(ivLength > 0);
  assert(fixedBits >= 0);
  assert(counterBits > 0);

  const ivBits = ivLength * 8;
  const randomBits = ivBits - fixedBits - counterBits;
  assert(randomBits >= 0);

  let fixedMask = 0n;
  let fixed = 0n;
  if (fixedBits > 0) {
    fixedMask = BigInt(`0b${"1".repeat(fixedBits)}${"0".repeat(randomBits + counterBits)}`);
    switch (typeof fixedInput) {
      case "bigint":
        fixed = fixedInput;
        break;
      case "object":
        fixed = BigInt(`0x${toHex(fixedInput)}`);
        break;
      default:
        throw new Error("bad CounterIvOptions.fixed");
    }
    fixed <<= BigInt(randomBits + counterBits);
    fixed &= fixedMask;
  }

  let randomMask = 0n;
  let random = 0n;
  if (randomBits > 0) {
    randomMask = BigInt(`0b${"1".repeat(randomBits)}${"0".repeat(counterBits)}`);
    const randomBuffer = crypto.getRandomValues(new Uint8Array(ivLength));
    random = BigInt(`0x${toHex(randomBuffer)}`);
    random &= randomMask;
  }

  const maxCounter = BigInt(`0b1${"0".repeat(counterBits)}`);
  const counterMask = maxCounter - 1n;

  return {
    ivBits,
    fixedBits,
    fixedMask,
    fixed,
    randomBits,
    randomMask,
    random,
    counterMask,
    maxCounter,
  };
}

function throwCounterIvError(): never {
  throw new Error("CounterIv error");
}

class CounterIncrement {
  constructor(public readonly blockSize: number, public readonly maxCounter: bigint) {
    assert(blockSize > 0);
  }

  public counter = 0n;

  public appendBlocks(plaintextLength: number, ciphertextLength: number): void {
    this.counter += BigInt(Math.ceil(Math.max(plaintextLength, ciphertextLength) / this.blockSize));
    if (this.counter > this.maxCounter) {
      throwCounterIvError();
    }
  }
}

/** IV generator using fixed+random+counter structure. */
export class CounterIvGen extends IvGen {
  constructor(opts: CounterIvGen.Options) {
    super(opts.ivLength);
    const { fixed, random, maxCounter } = parseCounterIvOptions(opts);
    this.ivPrefix = fixed | random;
    this.ci = new CounterIncrement(opts.blockSize, maxCounter);
  }

  private readonly ivPrefix: bigint;
  private readonly ci: CounterIncrement;

  protected generate() {
    const iv = this.ivPrefix | this.ci.counter;
    return fromHex(iv.toString(16).padStart(2 * this.ivLength, "0"));
  }

  protected update(plaintextLength: number, ciphertextLength: number) {
    this.ci.appendBlocks(plaintextLength, ciphertextLength);
  }
}

export namespace CounterIvGen {
  export interface Options extends CounterIvOptions {}
}

/** Check IVs of fixed+random+counter structure to detect duplication. */
export class CounterIvChecker extends IvChecker {
  constructor(opts: CounterIvChecker.Options) {
    super(opts.ivLength);
    const {
      fixedMask,
      fixed,
      randomMask,
      counterMask,
      maxCounter,
    } = parseCounterIvOptions(opts);
    const {
      requireSameRandom = false,
      blockSize,
    } = opts;
    this.fixedMask = fixedMask;
    this.randomMask = randomMask;
    this.counterMask = counterMask;
    this.fixed = fixed;
    this.requireSameRandom = requireSameRandom;
    this.ci = new CounterIncrement(blockSize, maxCounter);
  }

  private readonly fixedMask: bigint;
  private readonly randomMask: bigint;
  private readonly counterMask: bigint;
  private readonly fixed: bigint;
  private readonly requireSameRandom: boolean;
  private lastRandom?: bigint;
  private readonly ci: CounterIncrement;

  public extract(iv: Uint8Array): {
    fixed: bigint;
    random: bigint;
    counter: bigint;
  } {
    assert(iv.length === this.ivLength);
    const value = BigInt(`0x${toHex(iv)}`);
    return {
      fixed: value & this.fixedMask,
      random: value & this.randomMask,
      counter: value & this.counterMask,
    };
  }

  protected check(iv: Uint8Array, plaintextLength: number, ciphertextLength: number) {
    const { fixed, random, counter } = this.extract(iv);
    if (fixed !== this.fixed) {
      throwCounterIvError();
    }

    if (counter < this.ci.counter) {
      throwCounterIvError();
    }

    if (this.requireSameRandom) {
      if (typeof this.lastRandom !== "bigint") {
        this.lastRandom = random;
      } else if (this.lastRandom !== random) {
        throwCounterIvError();
      }
    }

    this.ci.counter = counter;
    this.ci.appendBlocks(plaintextLength, ciphertextLength);
  }
}

export namespace CounterIvChecker {
  export interface Options extends CounterIvOptions {
    /**
     * If true, all IVs must have the same bits in the random portion.
     * @default false
     */
    requireSameRandom?: boolean;
  }
}
