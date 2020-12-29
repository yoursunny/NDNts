import { Component, NamingConvention } from "@ndn/packet";

import { IBLT } from "../iblt";
import type { PSyncCore } from "./core";

export class PSyncCodec {
  constructor(p: PSyncCodec.Parameters, private readonly c: PSyncCore) {
    Object.assign(this, p);

    for (let i = 0; i < this.nUselessCompsAfterIblt; ++i) {
      this.uselessCompsAfterIblt.push(new Component());
    }
  }

  public readonly uselessCompsAfterIblt: Component[] = [];

  public iblt2comp(iblt: IBLT): Component {
    return new Component(undefined, this.ibltCompression.compress(iblt.serialize()));
  }

  public comp2iblt(comp: Component): IBLT {
    const iblt = new IBLT(this.c.ibltParams);
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

    /**
     * Number of useless components between IBLT and Version.
     * @see https://github.com/named-data/PSync/blob/b60398c5fc216a1b577b9dbcf61d48a21cb409a4/PSync/full-producer.cpp#L239
     */
    nUselessCompsAfterIblt: number;

    /** Version convention for SyncData. */
    versionConvention: NamingConvention<number, number>;

    /** Segment number convention for SyncData. */
    segmentNumConvention: NamingConvention<number, number>;
  }
}
