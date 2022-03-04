import { Component, Name } from "@ndn/packet";
import type { BloomFilter } from "@yoursunny/psync-bloom";
import applyMixins from "applymixins";

import { Compression as Compression_, IbltCodec } from "../detail/iblt-codec";
import type { IBLT } from "../iblt";
import type { PSyncCore } from "./core";

export class PSyncCodec {
  constructor(p: PSyncCodec.Parameters, protected readonly ibltParams: IBLT.PreparedParameters) {
    Object.assign(this, p);

    for (let i = 0; i < this.nUselessCompsAfterIblt; ++i) {
      this.uselessCompsAfterIblt.push(new Component());
    }
  }

  public readonly uselessCompsAfterIblt: Component[] = [];

  public state2buffer(state: PSyncCore.State): Uint8Array {
    return this.contentCompression.compress(this.encodeState(state));
  }

  public buffer2state(buffer: Uint8Array): PSyncCore.State {
    return this.decodeState(this.contentCompression.decompress(buffer));
  }
}

export interface PSyncCodec extends Readonly<PSyncCodec.Parameters>, IbltCodec {}
applyMixins(PSyncCodec, [IbltCodec]);

export namespace PSyncCodec {
  export type Compression = Compression_;

  export interface Parameters {
    /** Compression method for IBLT in name component. */
    ibltCompression: Compression;

    /**
     * Number of useless components between IBLT and Version.
     * @see https://github.com/named-data/PSync/blob/b60398c5fc216a1b577b9dbcf61d48a21cb409a4/PSync/full-producer.cpp#L239
     */
    nUselessCompsAfterIblt: number;

    /** Compression method for State in segmented object. */
    contentCompression: Compression;

    /** Encode State to buffer (without compression). */
    encodeState: (state: PSyncCore.State) => Uint8Array;

    /** Decode State from buffer (without decompression). */
    decodeState: (payload: Uint8Array) => PSyncCore.State;

    /** Convert a name prefix to a Bloom filter key. */
    toBloomKey: (prefix: Name) => string | Uint8Array;

    /** Number of name components in an encoded Bloom filter. */
    encodeBloomLength: number;

    /** Encode a Bloom filter. */
    encodeBloom: (bf: BloomFilter) => Component[];

    /** Decode a Bloom filter. */
    decodeBloom: (Bloom: typeof BloomFilter, comps: readonly Component[]) => Promise<BloomFilter>;
  }
}
