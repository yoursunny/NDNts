import { type ConsumerOptions, Endpoint } from "@ndn/endpoint";
import { GenericNumber, Segment } from "@ndn/naming-convention2";
import { Data, Interest, lpm, Name, noopSigning, TT as l3TT, type Verifier } from "@ndn/packet";
import { fetch } from "@ndn/segmented-object";
import { type Subscriber, type Subscription, SubscriptionTable, type SyncUpdate } from "@ndn/sync-api";
import { Decoder, EvDecoder } from "@ndn/tlv";
import { assert, concatBuffers, CustomEvent } from "@ndn/util";
import { batch, consume, pipeline, transform } from "streaming-iterables";
import { TypedEventTarget } from "typescript-event-target";

import { ContentTypeEncap, MappingKeyword, TT, Version0 } from "./an";
import { SvMappingEntry } from "./mapping-entry";
import type { SvSync } from "./sync";

type EventMap = {
  error: CustomEvent<Error>;
};

/**
 * SVS-PS subscriber.
 * @typeParam MappingEntry - Subclass of SvMappingEntry.
 * If it is not {@link SvMappingEntry} base class, its constructor must be specified in
 * {@link SvSubscriber.Options.mappingEntryType}.
 */
export class SvSubscriber<MappingEntry extends SvMappingEntry = SvMappingEntry>
  extends TypedEventTarget<EventMap>
  implements Subscriber<Name, SvSubscriber.Update, SvSubscriber.SubscribeInfo<MappingEntry>> {
  constructor({
    endpoint = new Endpoint(),
    sync,
    retxLimit = 2,
    mappingBatch = 10,
    mappingEntryType = SvMappingEntry,
    mustFilterByMapping = false,
    innerVerifier = noopSigning,
    outerVerifier = noopSigning,
    mappingVerifier = noopSigning,
  }: SvSubscriber.Options) {
    super();
    this.endpoint = endpoint;
    this.syncPrefix = sync.syncPrefix;
    this.mappingBatch = mappingBatch;
    this.mappingEVD = makeMappingEVD<MappingEntry>(mappingEntryType as SvMappingEntry.Constructor<MappingEntry>);
    this.mustFilterByMapping = mustFilterByMapping;
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
    sync.addEventListener("update", this.handleSyncUpdate);
  }

  private readonly abort = new AbortController();
  private readonly endpoint: Endpoint;
  private readonly syncPrefix: Name;
  private readonly nameSubs = new SubscriptionTable<SvSubscriber.Update>();
  private readonly nameFilters = new WeakMap<Subscription<Name, SvSubscriber.Update>, (entry: MappingEntry) => boolean>();
  private readonly publisherSubs = new SubscriptionTable<SvSubscriber.Update>();
  private readonly mappingBatch: number;
  private readonly mappingEVD: EvDecoder<Mapping<MappingEntry>>;
  private readonly mustFilterByMapping: boolean;
  private readonly innerVerifier: Verifier;
  private readonly outerFetchOpts: fetch.Options;
  private readonly outerConsumerOpts: ConsumerOptions;
  private readonly mappingConsumerOpts: ConsumerOptions;

  private emitError(message: string): void {
    this.dispatchTypedEvent("error", new CustomEvent("error", {
      detail: new Error(message),
    }));
  }

  /**
   * Stop subscriber operations.
   *
   * @remarks
   * This does not stop the {@link SvSync} instance.
   */
  public close(): void {
    this.abort.abort();
  }

  /** Subscribe to either a topic prefix or a publisher node ID. */
  public subscribe(topic: SvSubscriber.SubscribeInfo<MappingEntry>): Subscription<Name, SvSubscriber.Update> {
    if ((topic as SvSubscriber.SubscribePublisher).publisher instanceof Name) {
      return this.publisherSubs.subscribe((topic as SvSubscriber.SubscribePublisher).publisher).sub;
    }
    if (topic instanceof Name) {
      return this.nameSubs.subscribe(topic).sub;
    }
    topic = topic as SvSubscriber.SubscribePrefixFilter<MappingEntry>;
    const { sub } = this.nameSubs.subscribe(topic.prefix);
    this.nameFilters.set(sub, topic.filter);
    return sub;
  }

  private readonly handleSyncUpdate = async (update: SyncUpdate<Name>) => {
    const publisherSubs = this.publisherSubs.list(update.id);
    let mapping: Mapping<MappingEntry> | undefined;
    if (this.nameSubs.dimension !== 0 && (publisherSubs.size === 0 || this.mustFilterByMapping)) {
      mapping = await this.retrieveMapping(update);
    }
    await pipeline(
      () => update.seqNums(),
      transform(Infinity, async (seqNum) => {
        try {
          await this.dispatchUpdate(update.id, publisherSubs, seqNum, mapping);
        } catch (err: unknown) {
          this.emitError(`dispatchUpdate(${update.id}, ${seqNum}): ${err}`);
        }
      }),
      consume,
    );
  };

  private async retrieveMapping(update: SyncUpdate<Name>): Promise<Mapping<MappingEntry>> {
    const m = new Map<number, MappingEntry>();
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
          this.mappingEVD.decode(m, new Decoder(data.content));
        } catch (err: unknown) {
          this.emitError(`retrieveMapping(${update.id},${loSeqNum}..${hiSeqNum}): ${err}`);
        }
      }),
      consume,
    );
    return m;
  }

  private async dispatchUpdate(publisher: Name, publisherSubs: SubSet, seqNum: number, mapping?: Mapping<MappingEntry>): Promise<void> {
    let name: Name | undefined;
    let nameSubs: Sub[] | undefined;
    if (publisherSubs.size === 0 && mapping) {
      const entry = mapping.get(seqNum);
      if (!entry || (nameSubs = this.listNameSubs(entry.name, entry)).length === 0) {
        return;
      }
    }

    const decap = async ({ content }: Data): Promise<Data | false> => {
      const inner = Decoder.decode(content, Data);
      await this.innerVerifier.verify(inner);
      name ??= inner.name.get(-2)?.equals(Version0) ? inner.name.getPrefix(-2) : inner.name;
      if ((nameSubs ??= this.listNameSubs(name, mapping?.get(seqNum))).length === 0 && publisherSubs.size === 0) {
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

    const update = new SvSubscriber.Update(publisher, seqNum, name!, payload);
    this.publisherSubs.update(publisherSubs, update);
    this.nameSubs.update(nameSubs!, update);
  }

  private listNameSubs(name: Name, entry?: MappingEntry): Sub[] {
    const subs: Sub[] = [];
    for (const set of lpm<SubSet>(name, (prefixHex) => this.nameSubs.list(prefixHex))) {
      if (entry) {
        for (const sub of set) {
          if (this.nameFilters.get(sub)?.(entry) !== false) {
            subs.push(sub);
          }
        }
      } else {
        subs.push(...set);
      }
    }
    return subs;
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
    /**
     * Endpoint for communication.
     * @defaultValue
     * Endpoint on default logical forwarder.
     */
    endpoint?: Endpoint;

    /**
     * SvSync instance.
     * @see {@link SvPublisher.Options.sync} regarding reuse
     */
    sync: SvSync;

    /**
     * Retransmission limit for Data retrieval.
     * @defaultValue 2
     */
    retxLimit?: number;

    /**
     * Maximum quantity of MappingEntries to retrieve in a single query.
     * @defaultValue 10.
     * @see {@link https://github.com/named-data/ndn-svs/blob/e39538ed1ddd789de9a34c242af47c3ba4f3583d/ndn-svs/svspubsub.cpp#L199}
     */
    mappingBatch?: number;

    /**
     * MappingEntry constructor.
     * @defaultValue `SvMappingEntry` base type
     */
    mappingEntryType?: SvMappingEntry.Constructor;

    /**
     * If true, force the retrieval of MappingData.
     *
     * @remarks
     * When an update matches a {@link SubscribePublisher}, by default the MappingData is not
     * retrieved. Since the filter functions in {@link SubscribePrefixFilter} depend on
     * MappingEntry, they are not called, and each SubscribePrefixFilter is treated like a
     * {@link SubscribePrefix}, which would receive the message if the topic prefix matches.
     * Set this option to `true` forces the retrieval of MappingData and ensures filter functions
     * are called.
     */
    mustFilterByMapping?: boolean;

    /**
     * Inner Data verifier.
     * @defaultValue no verification
     */
    innerVerifier?: Verifier;

    /**
     * Outer Data verifier.
     * @defaultValue no verification
     */
    outerVerifier?: Verifier;

    /**
     * Mapping Data verifier.
     * @defaultValue no verification
     */
    mappingVerifier?: Verifier;
  }

  /** Subscribe parameters. */
  export type SubscribeInfo<MappingEntry extends SvMappingEntry> = SubscribePrefix | SubscribePrefixFilter<MappingEntry> | SubscribePublisher;

  /** Subscribe to messages udner a name prefix. */
  export type SubscribePrefix = Name;

  /** Subscribe to messages under a name prefix that passes a filter. */
  export interface SubscribePrefixFilter<MappingEntry extends SvMappingEntry> {
    /** Topic prefix. */
    prefix: Name;

    /**
     * Filter function to determine whether to retrieve a message based on MappingEntry.
     * @see {@link Options.mustFilterByMapping} for limitations on when this may not be invoked.
     */
    filter(entry: MappingEntry): boolean;
  }

  /** Subscribe to messages from the specified publisher. */
  export interface SubscribePublisher {
    publisher: Name;
  }

  /** Received update. */
  export class Update extends Event {
    constructor(
        public readonly publisher: Name,
        public readonly seqNum: number,
        public readonly name: Name,
        public readonly payload: Uint8Array,
    ) {
      super("update");
    }
  }
}

type Mapping<M extends SvMappingEntry> = Map<number, M>;

function makeMappingEVD<M extends SvMappingEntry>(ctor: SvMappingEntry.Constructor<M>): EvDecoder<Mapping<M>> {
  return new EvDecoder<Mapping<M>>("MappingData", TT.MappingData)
    .add(l3TT.Name, () => undefined)
    .add(TT.MappingEntry, (map, { vd }) => {
      const entry = ctor.decodeFrom(vd);
      map.set(entry.seqNum, entry);
    }, { repeat: true });
}

type Sub = Subscription<Name, SvSubscriber.Update>;
type SubSet = ReadonlySet<Sub>;
