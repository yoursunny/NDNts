import { assert, crypto, toHex } from "@ndn/util";

/**
 * Options for Initialization Vectors using fixed+random+counter structure.
 *
 * IVs following this construction method have three parts:
 * 1. fixed bits, specified in options.
 * 2. random bits, different for each key and in each session.
 * 3. counter bits, monotonically increasing for each plaintext/ciphertext block.
 */
export interface CounterIvOptions {
  /** IV length in octets. */
  ivLength: number;

  /**
   * Number of fixed bits.
   * @defaultValue 0
   */
  fixedBits?: number;

  /**
   * Fixed portion.
   *
   * @remarks
   * Required if fixedBits is positive.
   * This may be specified as a bigint or a Uint8Array.
   * If it's a Uint8Array, it must have at least fixedBits bits.
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

export function parseCounterIvOptions({
  ivLength,
  fixedBits = 0,
  fixed: fixedInput,
  counterBits,
}: CounterIvOptions): parseCounterIvOptions.Result {
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
      case "bigint": {
        fixed = fixedInput;
        break;
      }
      case "object": {
        fixed = BigInt(`0x${toHex(fixedInput)}`);
        break;
      }
      default: {
        throw new Error("bad CounterIvOptions.fixed");
      }
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
export namespace parseCounterIvOptions {
  export interface Result {
    ivBits: number;
    fixedBits: number;
    fixedMask: bigint;
    fixed: bigint;
    randomBits: number;
    randomMask: bigint;
    random: bigint;
    counterMask: bigint;
    maxCounter: bigint;
  }
}

export function throwCounterIvErrorIf(cond: boolean): void {
  if (cond) {
    throw new Error("CounterIv error");
  }
}

export class CounterIncrement {
  constructor(blockSize: number, private readonly maxCounter: bigint) {
    assert(blockSize > 0);
    this.blockSize = BigInt(blockSize);
  }

  public readonly blockSize: bigint;
  public counter = 0n;

  public appendBlocks(plaintextLength: number, ciphertextLength: number): void {
    const nOctets = BigInt(Math.max(plaintextLength, ciphertextLength));
    this.counter += (nOctets + this.blockSize - 1n) / this.blockSize;
    throwCounterIvErrorIf(this.counter > this.maxCounter);
  }
}
