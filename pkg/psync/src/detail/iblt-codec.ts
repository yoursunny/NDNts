import { Component } from "@ndn/packet";

import { IBLT } from "../iblt";

export interface Compression {
  compress: (input: Uint8Array) => Uint8Array;
  decompress: (compressed: Uint8Array) => Uint8Array;
}

export class IbltCodec {
  declare public readonly ibltCompression: Compression;
  declare protected readonly ibltParams: IBLT.PreparedParameters;

  public iblt2comp(iblt: IBLT): Component {
    return new Component(undefined, this.ibltCompression.compress(iblt.serialize()));
  }

  public comp2iblt(comp: Component): IBLT {
    const iblt = new IBLT(this.ibltParams);
    iblt.deserialize(this.ibltCompression.decompress(comp.value));
    return iblt;
  }
}
