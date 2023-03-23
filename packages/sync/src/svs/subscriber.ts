import { EventEmitter } from "node:events";

import type { ConsumerOptions } from "@ndn/endpoint";
import { Endpoint } from "@ndn/endpoint";
import { GenericNumber, Segment } from "@ndn/naming-convention2";
import { Data, Interest, lpm, Name, noopSigning, TT as l3TT, type Verifier } from "@ndn/packet";
import { fetch } from "@ndn/segmented-object";
import { Decoder, EvDecoder } from "@ndn/tlv";
import { assert, concatBuffers } from "@ndn/util";
import { batch, consume, pipeline, transform } from "streaming-iterables";
import type TypedEmitter from "typed-emitter";

import { SubscriptionTable } from "../detail/subscription-table";
import type { Subscriber, Subscription, SyncUpdate } from "../types";
import { ContentTypeEncap, MappingKeyword, TT, Version0 } from "./an";
import type { SvSync } from "./sync";

type Events = {
  error: (err: Error) => void;
};

/** SVS-PS subscriber. */
export class SvSubscriber extends (EventEmitter as new() => TypedEmitter<Events>)
  implements Subscriber<Name, SvSubscriber.Update, SvSubscriber.SubscribeInfo> {
  constructor({
    endpoint = new Endpoint(),
    sync,
    retxLimit = 2,
    mappingBatch = 10,
    innerVerifier = noopSigning,
    outerVerifier = noopSigning,
    mappingVerifier = noopSigning,
  }: SvSubscriber.Options) {
    super();
    this.on("error", () => undefined);
    this.endpoint = endpoint;
    this.syncPrefix = sync.syncPrefix;
    this.mappingBatch = mappingBatch;
    this.innerVerifier = innerVerifier;
    this.outerFetchOpts = {
      endpoint,
      describe: `SVS-PS(${sync.syncPrefix})[retrieve]`,
      signal: this.abort.signal,
      retxLimit,
      acceptContentType: [0, ContentTypeEncap],
      verifier: outerVerifier,
    };
    this.outerConsumerOpts = {
      describe: `SVS-PS(${sync.syncPrefix})[retrieve]`,
      signal: this.abort.signal,
      retx: retxLimit,
      verifier: outerVerifier,
    };
    this.mappingConsumerOpts = {
      describe: `SVS-PS(${sync.syncPrefix})[mapping]`,
      signal: this.abort.signal,
      retx: retxLimit,
      verifier: mappingVerifier,
    };
    sync.on("update", this.handleSyncUpdate);
  }

  private readonly abort = new AbortController();
  private readonly endpoint: Endpoint;
  private readonly syncPrefix: Name;
  private readonly nameSubs = new SubscriptionTable<SvSubscriber.Update>();
  private readonly publisherSubs = new SubscriptionTable<SvSubscriber.Update>();
  private readonly mappingBatch: number;
  private readonly innerVerifier: Verifier;
  private readonly outerFetchOpts: fetch.Options;
  private readonly outerConsumerOpts: ConsumerOptions;
  private readonly mappingConsumerOpts: ConsumerOptions;

  /**
   * Stop subscriber operations.
   * This does not stop the SvSync instance.
   */
  public close(): void {
    this.abort.abort();
  }

  /** Subscribe to either a topic prefix or a publisher node ID. */
  public subscribe(topic: SvSubscriber.SubscribeInfo): Subscription<Name, SvSubscriber.Update> {
    if (topic instanceof Name) {
      return this.nameSubs.subscribe(topic).sub;
    }
    return this.publisherSubs.subscribe(topic.publisher).sub;
  }

  private readonly handleSyncUpdate = async (update: SyncUpdate<Name>) => {
    const publisherSubs = this.publisherSubs.list(update.id);
    let mapping: Mapping | undefined;
    if (publisherSubs.size === 0 && this.nameSubs.dimension !== 0) {
      mapping = await this.retrieveMapping(update);
    }
    await pipeline(
      () => update.seqNums(),
      transform(Infinity, async (seqNum) => {
        try {
          await this.dispatchUpdate(update.id, publisherSubs, seqNum, mapping);
        } catch (err: unknown) {
          this.emit("error", new Error(`dispatchUpdate(${update.id}, ${seqNum}): ${err}`));
        }
      }),
      consume,
    );
  };

  private async retrieveMapping(update: SyncUpdate<Name>): Promise<Mapping> {
    const m = new Map<number, Name>();
    await pipeline(
      () => update.seqNums(),
      batch(this.mappingBatch),
      transform(Infinity, async (range) => {
        const loSeqNum = range[0]!;
        const hiSeqNum = range.at(-1)!;
        const interest = new Interest(
          update.id.append(...this.syncPrefix.comps, MappingKeyword,
            GenericNumber.create(loSeqNum), GenericNumber.create(hiSeqNum)),
        );
        try {
          const data = await this.endpoint.consume(interest, this.mappingConsumerOpts);
          mappingDataEVD.decode(m, new Decoder(data.content));
        } catch (err: unknown) {
          this.emit("error", new Error(`retrieveMapping(${update.id},${loSeqNum}..${hiSeqNum}): ${err}`));
        }
      }),
      consume,
    );
    return m;
  }

  private async dispatchUpdate(publisher: Name, publisherSubs: SubSet, seqNum: number, mapping?: Mapping): Promise<void> {
    let name: Name | undefined;
    let nameSubs: Sub[] | undefined;
    if (mapping) {
      name = mapping.get(seqNum);
      if (!name || (nameSubs = Array.from(this.listNameSubs(name))).length === 0) {
        return;
      }
    }

    const decap = async ({ content }: Data): Promise<Data | false> => {
      const inner = new Decoder(content).decode(Data);
      await this.innerVerifier.verify(inner);
      name ??= inner.name.get(-2)?.equals(Version0) ? inner.name.getPrefix(-2) : inner.name;
      if ((nameSubs ??= Array.from(this.listNameSubs(name))).length === 0 && publisherSubs.size === 0) {
        return false;
      }
      return inner;
    };

    const outerPrefix = publisher.append(...this.syncPrefix.comps, GenericNumber.create(seqNum));
    let payload: Uint8Array;
    const outer = await this.endpoint.consume(
      new Interest(outerPrefix, Interest.CanBePrefix),
      this.outerConsumerOpts,
    );
    const inner = await decap(outer);
    if (!inner) {
      return;
    }
    if (outer.name.equals(outerPrefix)) {
      payload = inner.content;
    } else {
      payload = await this.retrieveSegmented(outerPrefix, decap);
    }

    const update: SvSubscriber.Update = {
      publisher,
      seqNum,
      name: name!,
      payload,
    };
    this.publisherSubs.update(publisherSubs, update);
    this.nameSubs.update(nameSubs!, update);
  }

  private *listNameSubs(name: Name): Iterable<Sub> {
    for (const set of lpm<SubSet>(name, (prefixHex) => this.nameSubs.list(prefixHex))) {
      yield* set;
    }
  }

  private async retrieveSegmented(outerPrefix: Name, decap: (outer: Data) => Promise<Data | false>): Promise<Uint8Array> {
    const fetching = fetch(outerPrefix.append(Version0), this.outerFetchOpts);
    const segments: Uint8Array[] = [];
    let nSegments = 0;
    let totalLength = 0;
    for await (const outer of fetching.unordered()) {
      const inner = await decap(outer);
      assert(inner);
      const segmentComp = inner.name.get(-1)!;
      assert(segmentComp.is(Segment));
      const segNum = segmentComp.as(Segment);
      segments[segNum] = inner.content;
      ++nSegments;
      totalLength += inner.content.byteLength;
    }
    segments.length = nSegments;
    return concatBuffers(segments, totalLength);
  }
}

export namespace SvSubscriber {
  export interface Options {
    /** Endpoint for communication. */
    endpoint?: Endpoint;

    /**
     * SvSync instance.
     * See notes on SvPublisher.Options regarding reuse.
     */
    sync: SvSync;

    /**
     * Retransmission limit for Data retrieval.
     * Default is 2.
     */
    retxLimit?: number;

    /**
     * Maximum number of MappingEntry to retrieve in a single query.
     * Default is 10.
     * @see https://github.com/named-data/ndn-svs/blob/e39538ed1ddd789de9a34c242af47c3ba4f3583d/ndn-svs/svspubsub.cpp#L199
     */
    mappingBatch?: number;

    /**
     * Inner Data verifier.
     * Default is no verification.
     */
    innerVerifier?: Verifier;

    /**
     * Outer Data verifier.
     * Default is no verification.
     */
    outerVerifier?: Verifier;

    /**
     * Mapping Data verifier.
     * Default is no verification.
     */
    mappingVerifier?: Verifier;
  }

  /**
   * Subscribe parameters.
   * If specified as Name, the subscription receives messages with specified name prefix,
   * regardless of who published it.
   * If specified as `{ publisher }`, the subscription receives messages from specified publisher.
   */
  export type SubscribeInfo = Name | { publisher: Name };

  /** Received update. */
  export interface Update {
    readonly publisher: Name;
    readonly seqNum: number;
    readonly name: Name;
    readonly payload: Uint8Array;
  }
}

type Mapping = Map<number, Name>;
type MappingEntry = [seqNum: number, name: Name];

const mappingEntryEVD = new EvDecoder<MappingEntry>("MappingEntry", TT.MappingEntry)
  .add(TT.SeqNo, (t, { nni }) => t[0] = nni, { required: true })
  .add(l3TT.Name, (t, { decoder }) => t[1] = decoder.decode(Name), { required: true });

const mappingDataEVD = new EvDecoder<Mapping>("MappingData", TT.MappingData)
  .add(l3TT.Name, () => undefined)
  .add(TT.MappingEntry, (m, { vd }) => {
    const [seqNum, name] = mappingEntryEVD.decodeValue([] as unknown as MappingEntry, vd);
    m.set(seqNum, name);
  }, { repeat: true });

type Sub = Subscription<Name, SvSubscriber.Update>;
type SubSet = ReadonlySet<Sub>;
