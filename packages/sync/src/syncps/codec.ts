import type { Data } from "@ndn/packet";
import applyMixins from "applymixins";

import { Compression as Compression_, IbltCodec } from "../detail/iblt-codec";
import type { IBLT } from "../iblt";

export class SyncpsCodec {
  constructor(p: SyncpsCodec.Parameters, protected readonly ibltParams: IBLT.PreparedParameters) {
    Object.assign(this, p);
  }
}

export interface SyncpsCodec extends Readonly<SyncpsCodec.Parameters>, IbltCodec {}
applyMixins(SyncpsCodec, [IbltCodec]);

export namespace SyncpsCodec {
  export type Compression = Compression_;

  export interface Parameters {
    /** Compression method for IBLT in name component. */
    ibltCompression: Compression;

    /** Compute the hash of a publication. */
    hashPub: (pub: Data) => number;

    /** Encode Content to buffer. */
    encodeContent: (pubs: readonly Data[], maxSize: number) => [wire: Uint8Array, count: number];

    /** Decode Content from buffer. */
    decodeContent: (payload: Uint8Array) => Data[];
  }
}
