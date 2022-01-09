import { fromHex } from "@ndn/tlv";

import { CounterIncrement, type CounterIvOptions, parseCounterIvOptions } from "./counter-common";
import { IvGen } from "./gen";

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

  protected override generate() {
    const iv = this.ivPrefix | this.ci.counter;
    return fromHex(iv.toString(16).padStart(2 * this.ivLength, "0"));
  }

  protected override update(plaintextLength: number, ciphertextLength: number) {
    this.ci.appendBlocks(plaintextLength, ciphertextLength);
  }
}

export namespace CounterIvGen {
  export interface Options extends CounterIvOptions {}
}
