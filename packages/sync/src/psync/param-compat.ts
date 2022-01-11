import { Segment as segmentNumConvention, Version as versionConvention } from "@ndn/naming-convention1";
import { type NamingConvention, AltUri, Component, Name, TT } from "@ndn/packet";
import { Decoder, Encoder, EvDecoder, NNI, toUtf8 } from "@ndn/tlv";
// @ts-expect-error typing unavailable
import murmurHash3 from "murmurhash3js-revisited";

import type { IBLT } from "../iblt";
import type { PSyncCodec } from "./codec";
import type { PSyncCore } from "./core";
import type { PSyncFull } from "./full";
import type { PSyncPartialPublisher } from "./partial-publisher";
import type { PSyncPartialSubscriber } from "./partial-subscriber";

const GenericNumber: NamingConvention<number, number> = {
  match(comp: Component): boolean {
    return comp.type === TT.GenericNameComponent && NNI.isValidLength(comp.length);
  },
  create(v: number): Component {
    return new Component(undefined, Encoder.encode(NNI(v), 4));
  },
  parse(comp: Component): number {
    return NNI.decode(comp.value);
  },
};

export function hash(seed: number, input: Uint8Array): number {
  return murmurHash3.x86.hash32(input, seed);
}

const nHash = 3;
const checkSeed = 11;

export function makeIbltParams(
    expectedEntries: number,
    keyToBufferLittleEndian: boolean,
    serializeLittleEndian = false,
): IBLT.Parameters {
  let nEntries = Math.trunc(expectedEntries * 1.5);
  const rem = nEntries % 3;
  if (rem !== 0) {
    nEntries += nHash - rem;
  }
  return {
    keyToBufferLittleEndian,
    serializeLittleEndian,
    hash,
    nHash,
    checkSeed,
    nEntries,
  };
}

function joinPrefixSeqNum({ prefix, seqNum }: PSyncCore.PrefixSeqNum) {
  const name = prefix.append(GenericNumber, seqNum);
  return {
    get value() {
      return name.value;
    },
    get hash() {
      const uri = AltUri.ofName(name);
      return hash(checkSeed, toUtf8(uri));
    },
  };
}

function splitPrefixSeqNum(value: Uint8Array) {
  const name = new Name(value);
  return {
    prefix: name.getPrefix(-1),
    seqNum: name.at(-1).as(GenericNumber),
  };
}

const noCompression: PSyncCodec.Compression = {
  compress: (input) => new Uint8Array(input),
  decompress: (input) => input,
};

const TTPSyncContent = 0x80;

const PSyncStateEVD = new EvDecoder<PSyncCore.PrefixSeqNum[]>("PSyncState")
  .add(TT.Name, (t, { value }) => t.push(splitPrefixSeqNum(value)), { repeat: true });

/** Create algorithm parameters to be compatible with PSync C++ library. */
export function makePSyncCompatParam({
  keyToBufferLittleEndian = true,
  expectedEntries = 80,
  expectedSubscriptions = 16,
  ibltCompression = noCompression,
  contentCompression = noCompression,
}: makePSyncCompatParam.Options = {}): PSyncFull.Parameters & PSyncPartialPublisher.Parameters & PSyncPartialSubscriber.Parameters {
  return {
    iblt: makeIbltParams(expectedEntries, keyToBufferLittleEndian),
    threshold: Math.trunc(expectedEntries / 2),
    joinPrefixSeqNum,

    versionConvention,
    segmentNumConvention,

    ibltCompression,
    nUselessCompsAfterIblt: 1,

    contentCompression,
    encodeState(state) {
      return Encoder.encode([
        TTPSyncContent,
        ...state.map((ps) => [TT.Name, joinPrefixSeqNum(ps).value]),
      ]);
    },
    decodeState(payload) {
      const list: PSyncCore.State = [];
      PSyncStateEVD.decode(list, new Decoder(payload));
      return list;
    },

    bloom: {
      hash,
      projectedElementCount: expectedSubscriptions,
      falsePositiveProbability: 0.001,
    },
    toBloomKey(prefix) {
      return AltUri.ofName(prefix);
    },
    encodeBloomLength: 3,
    encodeBloom(bf) {
      return [
        GenericNumber.create(bf.projectedElementCount),
        GenericNumber.create(Math.trunc(bf.falsePositiveProbability * 1000)),
        new Component(undefined, bf.encode()),
      ];
    },
    decodeBloom(Bloom, comps) {
      if (comps.length !== this.encodeBloomLength || !GenericNumber.match(comps[0]!) || !GenericNumber.match(comps[1]!)) {
        throw new Error("PSyncCompatParam.decodeBloom bad input");
      }
      return Bloom.create({
        hash,
        projectedElementCount: GenericNumber.parse(comps[0]!),
        falsePositiveProbability: GenericNumber.parse(comps[1]!) / 1000,
      }, comps[2]!.value);
    },
  };
}

export namespace makePSyncCompatParam {
  export interface Options {
    /**
     * Whether to use little endian when converting uint32 key to Uint8Array.
     * PSync C++ library behaves differently on big endian and little endian machines,
     * https://github.com/named-data/PSync/blob/b60398c5fc216a1b577b9dbcf61d48a21cb409a4/PSync/detail/util.cpp#L126
     * This must be set to match other peers.
     * @default true
     */
    keyToBufferLittleEndian?: boolean;

    /**
     * Expected number of IBLT entries, i.e. expected number of updates in a sync cycle.
     * This is irrelevant to PartialSync consumer.
     * @default 80
     */
    expectedEntries?: number;

    /**
     * Estimated number of subscriptions in PartialSync consumer.
     * @default 16
     */
    expectedSubscriptions?: number;

    /**
     * Whether to use zlib compression on IBLT.
     * Default is no compression. Use `PSyncZlib` to set zlib compression.
     *
     * In PSync C++ library, default for FullSync depends on whether zlib is available at compile
     * time, and default for PartialSync is no compression.
     * This must be set to match other peers.
     */
    ibltCompression?: PSyncCodec.Compression;

    /**
     * Whether to use zlib compression on Data payload.
     * Default is no compression. Use `PSyncZlib` to set zlib compression.
     *
     * In PSync C++ library, default for FullSync depends on whether zlib is available at compile
     * time. For PartialSync, it is always no compression.
     * This must be set to match other peers.
     */
    contentCompression?: PSyncCodec.Compression;
  }
}
