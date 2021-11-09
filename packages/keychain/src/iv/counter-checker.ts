import { toHex } from "@ndn/tlv";
import assert from "minimalistic-assert";

import { IvChecker } from "./checker";
import { CounterIncrement, CounterIvOptions, parseCounterIvOptions, throwCounterIvError } from "./counter-common";

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

  protected override check(iv: Uint8Array, plaintextLength: number, ciphertextLength: number) {
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
