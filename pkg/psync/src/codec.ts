import { Component, type Name, TT } from "@ndn/packet";
import type { BloomFilter } from "@yoursunny/psync-bloom";
import type { Promisable } from "type-fest";

import type { PSyncCore } from "./core";
import { IBLT } from "./iblt";

export class PSyncCodec {
  constructor(p: PSyncCodec.Parameters, protected readonly ibltParams: IBLT.PreparedParameters) {
    Object.assign(this, p);
  }

  public async iblt2comp(iblt: IBLT): Promise<Component> {
    return new Component(TT.GenericNameComponent, await this.ibltCompression.compress(iblt.serialize()));
  }

  public async comp2iblt(comp: Component): Promise<IBLT> {
    const iblt = new IBLT(this.ibltParams);
    iblt.deserialize(await this.ibltCompression.decompress(comp.value));
    return iblt;
  }

  public async state2buffer(state: PSyncCore.State): Promise<Uint8Array> {
    return this.contentCompression.compress(this.encodeState(state));
  }

  public async buffer2state(buffer: Uint8Array): Promise<PSyncCore.State> {
    return this.decodeState(await this.contentCompression.decompress(buffer));
  }
}
export interface PSyncCodec extends Readonly<PSyncCodec.Parameters> {}

export namespace PSyncCodec {
  export interface Compression {
    compress: (input: Uint8Array) => Promisable<Uint8Array>;
    decompress: (compressed: Uint8Array) => Promisable<Uint8Array>;
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
