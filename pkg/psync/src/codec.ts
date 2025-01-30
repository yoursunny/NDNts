import { Component, type Name, TT } from "@ndn/packet";
import type { BloomFilter } from "@yoursunny/psync-bloom";

import type { PSyncCore } from "./core";
import { IBLT } from "./iblt";

export class PSyncCodec {
  constructor(p: PSyncCodec.Parameters, protected readonly ibltParams: IBLT.PreparedParameters) {
    Object.assign(this, p);
  }

  public iblt2comp(iblt: IBLT): Component {
    return new Component(TT.GenericNameComponent, this.ibltCompression.compress(iblt.serialize()));
  }

  public comp2iblt(comp: Component): IBLT {
    const iblt = new IBLT(this.ibltParams);
    iblt.deserialize(this.ibltCompression.decompress(comp.value));
    return iblt;
  }

  public state2buffer(state: PSyncCore.State): Uint8Array {
    return this.contentCompression.compress(this.encodeState(state));
  }

  public buffer2state(buffer: Uint8Array): PSyncCore.State {
    return this.decodeState(this.contentCompression.decompress(buffer));
  }
}
export interface PSyncCodec extends Readonly<PSyncCodec.Parameters> {}

export namespace PSyncCodec {
  export interface Compression {
    compress: (input: Uint8Array) => Uint8Array;
    decompress: (compressed: Uint8Array) => Uint8Array;
  }

  export interface Parameters {
    /** Compression method for IBLT in name component. */
    ibltCompression: Compression;

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
