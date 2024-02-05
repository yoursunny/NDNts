import { Data, TT } from "@ndn/packet";
import { Decoder, Encoder, EvDecoder } from "@ndn/tlv";

import { makeZlib } from "../detail/zlib";
import { hash, makeIbltParams } from "../psync/param-compat";
import type { SyncpsPubsub } from "./pubsub";

const ibltCompression = makeZlib(6);

const TTSyncpsContent = 0x81;

const SyncpsContentEVD = new EvDecoder<Data[]>("SyncpsContent")
  .add(TT.Data, (t, { decoder }) => t.push(decoder.decode(Data)), { repeat: true });

/** Create algorithm parameters to be compatible with DNMP-v2 syncps library. */
export function makeSyncpsCompatParam({
  keyToBufferLittleEndian = true,
  expectedEntries = 85,
}: makeSyncpsCompatParam.Options = {}): SyncpsPubsub.Parameters {
  const iblt = makeIbltParams(expectedEntries, keyToBufferLittleEndian, true);
  return {
    iblt,

    ibltCompression,
    hashPub: (pub) => hash(iblt.checkSeed, Encoder.encode(pub)),
    encodeContent(pubs, maxSize) {
      const encoder = new Encoder(maxSize * 2);
      const list = [...pubs];
      while (list.length > 0 && encoder.size < maxSize) {
        encoder.prependValue(list.shift()); // order among publications doesn't matter
      }
      encoder.prependTypeLength(TTSyncpsContent, encoder.size);
      return [encoder.output, pubs.length - list.length];
    },
    decodeContent(payload) {
      const pubs: Data[] = [];
      SyncpsContentEVD.decode(pubs, new Decoder(payload));
      return pubs;
    },
  };
}

export namespace makeSyncpsCompatParam {
  export interface Options {
    /**
     * Whether to use little endian when converting a uint32 key to a byte array.
     * @defaultValue true
     *
     * @remarks
     * ndn-ind behaves differently on big endian and little endian machines,
     * {@link https://github.com/operantnetworks/ndn-ind/blob/dd934a7a5106cda6ea14675554427e12df1ce18f/src/lite/util/crypto-lite.cpp#L114}
     * This must be set to match other peers.
     */
    keyToBufferLittleEndian?: boolean;

    /**
     * Expected number of IBLT entries, i.e. expected number of updates in a sync cycle.
     * @defaultValue 85
     */
    expectedEntries?: number;
  }
}
