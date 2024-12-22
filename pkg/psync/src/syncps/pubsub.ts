import { consume, ConsumerOptions, produce, type Producer, ProducerOptions } from "@ndn/endpoint";
import { Timestamp } from "@ndn/naming-convention2";
import { type Component, Data, digestSigning, Interest, lpm, type Name, type Signer, type Verifier } from "@ndn/packet";
import { type Subscriber, type Subscription, SubscriptionTable } from "@ndn/sync-api";
import { KeyMap, toHex, trackEventListener } from "@ndn/util";
import DefaultWeakMap from "mnemonist/default-weak-map.js";
import filter from "obliterator/filter.js";
import take from "obliterator/take.js";
import { TypedEventTarget } from "typescript-event-target";

import { IBLT } from "../iblt";
import { SyncpsCodec } from "./codec";

interface PublicationEntry {
  key: number;
  pub: Data;
  cb?: SyncpsPubsub.PublishCallback;

  own: boolean;
  expired: boolean;

  timers: Array<NodeJS.Timeout | number>;
}

interface SyncInterestInfo {
  interest: Interest;
  recvIblt: IBLT;
}

interface PendingInterest extends SyncInterestInfo {
  expire: NodeJS.Timeout | number;
  defer: PromiseWithResolvers<Data | undefined>;
}

interface DebugEntry {
  action: string;
  key?: number;
  name?: Name;
  ownIblt: IBLT;
  recvIblt?: IBLT;
  content?: Name[];
}

type EventMap = {
  debug: CustomEvent<DebugEntry>;
};

function defaultModifyPublication(pub: Data) {
  pub.name = pub.name.append(Timestamp, Date.now());
}

function safeExtractTimestamp(pub: Data): number {
  try {
    return pub.name.at(-1).as(Timestamp);
  } catch {
    return 0;
  }
}

function defaultIsExpired(pub: Data) {
  return safeExtractTimestamp(pub);
}

function defaultFilterPubs(items: SyncpsPubsub.FilterPubItem[]) {
  if (!items.some((item) => item.own)) {
    return [];
  }

  const timestampMap = new DefaultWeakMap<Data, number>((pub) => safeExtractTimestamp(pub));
  items.sort((a, b) => {
    if (a.own !== b.own) {
      return a.own ? -1 : 1;
    }
    return timestampMap.get(b.pub) - timestampMap.get(a.pub);
  });
  return items;
}

/**
 * syncps - pubsub service.
 * @deprecated Deprecated in favor of SVS-PS protocol.
 */
export class SyncpsPubsub extends TypedEventTarget<EventMap> implements Subscriber<Name, CustomEvent<Data>> {
  constructor({
    p,
    syncPrefix,
    describe = `SyncpsPubsub(${syncPrefix})`,
    cpOpts,
    syncInterestLifetime = 4000,
    syncDataPubSize = 1300,
    syncSigner = digestSigning,
    syncVerifier,
    maxPubLifetime = 1000,
    maxClockSkew = 1000,
    modifyPublication = defaultModifyPublication,
    isExpired = defaultIsExpired,
    filterPubs = defaultFilterPubs,
    pubSigner = digestSigning,
    pubVerifier,
  }: SyncpsPubsub.Options) {
    super();
    this.describe = describe;
    this.syncPrefix = syncPrefix;
    const ibltParams = IBLT.PreparedParameters.prepare(p.iblt);
    this.codec = new SyncpsCodec(p, ibltParams);

    this.iblt = new IBLT(ibltParams);
    this.maxPubLifetime = maxPubLifetime;
    this.maxClockSkew = maxClockSkew;
    this.dModify = modifyPublication;
    this.dIsExpired = isExpired;
    this.dSigner = pubSigner;
    this.dVerifier = pubVerifier;
    this.dConfirmIblt = new IBLT(ibltParams);

    this.pProducer = produce(syncPrefix, this.handleSyncInterest, {
      describe: `${this.describe}[p]`,
      routeCapture: false,
      concurrency: Infinity,
      ...ProducerOptions.exact(cpOpts),
      dataSigner: syncSigner,
    });
    this.pFilter = filterPubs;
    this.pPubSize = syncDataPubSize;

    this.cOpts = {
      describe: `${this.describe}[c]`,
      ...ConsumerOptions.exact(cpOpts),
      verifier: syncVerifier,
    };
    this.cLifetime = syncInterestLifetime;

    this.scheduleSyncInterest(0);
  }

  private readonly maybeHaveEventListener = trackEventListener(this);
  public readonly describe: string;
  private readonly syncPrefix: Name;
  private readonly codec: SyncpsCodec;
  private closed = false;

  private readonly iblt: IBLT;
  private readonly pubs = new Map<number, PublicationEntry>();
  private readonly maxPubLifetime: number;
  private readonly maxClockSkew: number;
  private readonly subs = new SubscriptionTable<CustomEvent<Data>>();

  private readonly dModify: SyncpsPubsub.ModifyPublicationCallback;
  private readonly dIsExpired: SyncpsPubsub.IsExpiredCallback;
  private readonly dSigner: Signer;
  private readonly dVerifier?: Verifier;
  private nOwnPubs = 0;
  /** IBLT of own publications with callback. */
  private readonly dConfirmIblt: IBLT;

  private readonly pProducer: Producer;
  private readonly pFilter: SyncpsPubsub.FilterPubsCallback;
  private readonly pPubSize: number;
  private readonly pPendings = new KeyMap<Component, PendingInterest, string>((c) => toHex(c.value));

  private readonly cOpts: ConsumerOptions;
  private readonly cLifetime: number;
  private cAbort?: AbortController;
  private cTimer!: NodeJS.Timeout | number;
  private cCurrentInterestNonce?: number;
  private cDelivering = false;

  private debug(action: string, key?: number, pub?: Data): void;
  private debug(action: string, recvIblt?: IBLT, content?: readonly Data[], contentFirst?: number): void;
  private debug(action: string, arg2?: number | IBLT, arg3?: Data | readonly Data[], contentFirst = 0): void {
    if (!this.maybeHaveEventListener.debug) {
      return;
    }
    /* c8 ignore next */
    this.dispatchTypedEvent("debug", new CustomEvent<DebugEntry>("debug", {
      detail: {
        action,
        key: typeof arg2 === "number" ? arg2 : undefined,
        name: arg3 instanceof Data ? arg3.name : undefined,
        ownIblt: this.iblt.clone(),
        recvIblt: typeof arg2 === "object" ? arg2.clone() : undefined,
        content: Array.isArray(arg3) ? (arg3 as readonly Data[]).slice(0, contentFirst).map(({ name }) => name) : undefined,
      },
    }));
  }

  /** Stop the protocol operation. */
  public close(): void {
    if (this.closed) {
      return;
    }
    this.closed = true;

    for (const pub of this.pubs.values()) {
      for (const timer of pub.timers) {
        clearTimeout(timer);
      }
    }

    this.pProducer.close();

    this.cAbort?.abort();
    this.cAbort = undefined;
    clearTimeout(this.cTimer);
  }

  /**
   * Publish a packet.
   * @param pub - Data packet. This does not need to be signed.
   * @param cb - Callback to get notified whether publication is confirmed,
   *             i.e. its hash appears in a sync Interest from another participant.
   * @returns - Promise that resolves when the publication is recorded.
   *            It does not mean the publication has reached other participants.
   */
  public async publish(pub: Data, cb?: SyncpsPubsub.PublishCallback): Promise<void> {
    if (this.closed) {
      throw new Error("closed");
    }
    this.dModify(pub);
    await this.dSigner.sign(pub);

    const key = this.codec.hashPub(pub);
    if (this.pubs.has(key)) {
      this.debug("d-dup", key, pub);
      return;
    }
    this.addToActive(key, pub, true, cb);
    this.debug("d-pub", key, pub);

    if (!this.cDelivering) {
      this.scheduleSyncInterest(0);
      this.processPendingInterests();
    }
  }

  /** Subscribe to a topic. */
  public subscribe(topic: Name): Subscription<Name, CustomEvent<Data>> {
    const { sub } = this.subs.subscribe(topic);
    return sub;
  }

  private handleSyncInterest = async (interest: Interest): Promise<Data | undefined> => {
    if (interest.name.length !== this.syncPrefix.length + 1) {
      return undefined;
    }
    if (interest.nonce === this.cCurrentInterestNonce) {
      return undefined;
    }

    const ibltComp = interest.name.at(this.syncPrefix.length);
    if (this.pPendings.has(ibltComp)) {
      // same as a pending Interest; if it could be answered, it would have been answered
      return undefined;
    }

    const si: SyncInterestInfo = {
      interest,
      recvIblt: this.codec.comp2iblt(ibltComp),
    };
    const data = this.processSyncInterest(si);
    if (data) {
      return data;
    }

    this.debug("p-save", si.recvIblt);
    const pending = {
      ...si,
      expire: setTimeout(() => {
        if (this.pPendings.delete(ibltComp)) {
          pending.defer.resolve(undefined);
        }
      }, interest.lifetime),
      defer: Promise.withResolvers<Data | undefined>(),
    };
    this.pPendings.set(ibltComp, pending);
    return pending.defer.promise;
  };

  private processSyncInterest({ interest, recvIblt }: SyncInterestInfo): Data | undefined {
    {
      const { negative } = this.iblt.diff(this.dConfirmIblt, recvIblt);
      for (const key of negative) {
        const entry = this.pubs.get(key);
        if (entry?.own && !entry.expired) {
          this.invokePublishCb(entry, true);
        }
      }
    }

    const { positive } = this.iblt.diff(recvIblt);
    const items: SyncpsPubsub.FilterPubItem[] = [];
    for (const key of positive) {
      const entry = this.pubs.get(key);
      if (entry && !entry.expired) {
        items.push(entry);
      }
    }

    const filtered = this.pFilter(items).map(({ pub }) => pub);
    if (filtered.length === 0) {
      return undefined;
    }

    const [content, includedCount] = this.codec.encodeContent(filtered, this.pPubSize);
    this.debug("p-satisfy", recvIblt, filtered, includedCount);
    return new Data(interest.name, Data.FreshnessPeriod(this.maxPubLifetime / 2), content);
  }

  private processPendingInterests(): void {
    for (const [ibltComp, pending] of this.pPendings) {
      const data = this.processSyncInterest(pending);
      if (!data) {
        continue;
      }
      if (this.pPendings.delete(ibltComp)) {
        clearTimeout(pending.expire);
        pending.defer.resolve(data);
      }
    }
  }

  private scheduleSyncInterest(after = this.cLifetime - 20): void {
    clearTimeout(this.cTimer);
    this.cTimer = setTimeout(this.sendSyncInterest, after);
  }

  private sendSyncInterest = async (): Promise<void> => {
    if (this.closed) {
      return;
    }
    this.cAbort?.abort();
    this.scheduleSyncInterest();

    const abort = new AbortController();
    this.cAbort = abort;
    const ibltComp = this.codec.iblt2comp(this.iblt);
    const name = this.syncPrefix.append(ibltComp);
    this.debug("c-request");
    this.cCurrentInterestNonce = Interest.generateNonce();
    const interest = new Interest(name, Interest.CanBePrefix, Interest.MustBeFresh,
      Interest.Nonce(this.cCurrentInterestNonce), Interest.Lifetime(this.cLifetime));

    let content: Data[];
    try {
      const data = await consume(interest, {
        ...this.cOpts,
        signal: abort.signal,
      });
      content = this.codec.decodeContent(data.content);
    } catch {
      if (this.cAbort !== abort) { // aborted
        return;
      }
      this.debug("c-error");
      return;
    }

    const prevOwnPubs = this.nOwnPubs;
    this.cDelivering = true;
    try {
      const verifyResults = await Promise.all(content.map(async (pub) => {
        try {
          await this.dVerifier?.verify(pub);
        } catch {
          return false;
        }
        return true;
      }));

      for (const [i, pub] of content.entries()) {
        if (!verifyResults[i]) {
          this.debug("c-reject", undefined, pub);
          continue;
        }

        const key = this.codec.hashPub(pub);
        if (this.pubs.has(key) || this.isExpired(pub)) {
          this.debug("c-ignore", key, pub);
          continue;
        }

        this.addToActive(key, pub, false);
        const [sub] = take(filter(
          lpm(pub.name, (prefixHex) => this.subs.list(prefixHex)),
          (s) => s.size > 0), 1);
        if (sub) {
          this.debug("c-deliver", key, pub);
          this.subs.update(sub, new CustomEvent<Data>("update", { detail: pub }));
        } else {
          this.debug("c-nosub", key, pub);
        }
      }
    } finally {
      this.cDelivering = false;
    }

    if (this.cAbort === abort) { // this is the current Interest
      this.scheduleSyncInterest(0);
    }
    if (this.nOwnPubs !== prevOwnPubs) { // new publications during delivering
      this.processPendingInterests();
    }
  };

  private isExpired(pub: Data): boolean {
    const res = this.dIsExpired(pub);
    if (typeof res === "boolean") {
      return res;
    }
    const diff = Date.now() - res;
    return diff >= this.maxPubLifetime + this.maxClockSkew || diff <= -this.maxClockSkew;
  }

  private addToActive(key: number, pub: Data, own: boolean, cb?: SyncpsPubsub.PublishCallback) {
    if (this.closed) {
      throw new Error("unexpected addToActive");
    }
    if (own) {
      ++this.nOwnPubs;
      if (cb) {
        this.dConfirmIblt.insert(key);
      }
    }
    this.iblt.insert(key);

    const entry: PublicationEntry = {
      key,
      pub,
      cb,
      own,
      expired: false,
      timers: [
        setTimeout(() => {
          this.debug("d-expire", entry.key, entry.pub);
          entry.expired = true;
          this.invokePublishCb(entry, false);
        }, this.maxPubLifetime),
        setTimeout(() => {
          this.debug("d-unpublish", entry.key, entry.pub);
          this.iblt.erase(entry.key);
          this.scheduleSyncInterest(0);
        }, this.maxPubLifetime + this.maxClockSkew),
        setTimeout(() => {
          this.debug("d-forget", entry.key, entry.pub);
          this.pubs.delete(entry.key);
        }, this.maxPubLifetime * 2),
      ],
    };
    this.pubs.set(key, entry);
  }

  private invokePublishCb(entry: PublicationEntry, confirmed: boolean): void {
    if (!entry.cb) {
      return;
    }
    this.debug(confirmed ? "d-confirm" : "d-unconfirm", entry.key, entry.pub);
    entry.cb(entry.pub, confirmed);
    entry.cb = undefined;
    this.dConfirmIblt.erase(entry.key);
  }
}

export namespace SyncpsPubsub {
  export interface Parameters extends SyncpsCodec.Parameters {
    iblt: IBLT.Parameters;
  }

  export type ModifyPublicationCallback = (pub: Data) => void;

  /**
   * Callback to determine if a publication is expired.
   *
   * @remarks
   * The callback can return either:
   * - boolean to indicate whether the publication is expired.
   * - number, interpreted as Unix timestamp (milliseconds) of publication creation time.
   *   The publication is considered expired if this timestamp is before
   *   `NOW - (maxPubLifetime+maxClockSkew)` or after `NOW + maxClockSkew`.
   */
  export type IsExpiredCallback = (pub: Data) => boolean | number;

  export interface FilterPubItem {
    /** A publication, i.e. Data packet. */
    readonly pub: Data;

    /** Whether the publication is owned by the local participant. */
    readonly own: boolean;
  }

  /**
   * Callback to decide what publications to be included in a response.
   * @param items - Unexpired publications.
   * @returns A priority list of publications to be included in the response.
   */
  export type FilterPubsCallback = (items: FilterPubItem[]) => FilterPubItem[];

  export interface Options {
    /**
     * Algorithm parameters.
     *
     * @remarks
     * They must be the same on every peer.
     */
    p: Parameters;

    /** Sync group prefix. */
    syncPrefix: Name;

    /**
     * Description for debugging purpose.
     * @defaultValue SyncpsPubsub + syncPrefix
     */
    describe?: string;

    /**
     * Consumer and producer options.
     *
     * @remarks
     * - `.fw` may be specified.
     * - Most other fields are overridden.
     */
    cpOpts?: ConsumerOptions & ProducerOptions;

    /**
     * Sync Interest lifetime in milliseconds.
     * @defaultValue 4000
     */
    syncInterestLifetime?: number;

    /**
     * Advisory maximum size for publications included in a sync reply Data packet.
     * @defaultValue 1300
     */
    syncDataPubSize?: number;

    /**
     * Signer of sync reply Data packets.
     * @defaultValue digestSigning
     */
    syncSigner?: Signer;

    /**
     * Verifier of sync reply Data packets.
     * @defaultValue no verification
     */
    syncVerifier?: Verifier;

    /**
     * Publication lifetime.
     * @defaultValue 1000
     */
    maxPubLifetime?: number;

    /**
     * Maximum clock skew, for calculating timers.
     * @defaultValue 1000
     */
    maxClockSkew?: number;

    /**
     * Callback to modify publication before it's signed.
     * @defaultValue appending a TimestampNameComponent to the name
     */
    modifyPublication?: ModifyPublicationCallback;

    /**
     * Callback to determine if a publication is expired.
     *
     * @defaultValue
     * The last component is interpreted as TimestampNameComponent.
     * If it is not a TimestampNameComponent, the publication is seen as expired.
     */
    isExpired?: IsExpiredCallback;

    /**
     * Callback to decide what publications to be included in a response.
     *
     * @defaultValue
     * - Respond nothing if there's no own publication.
     * - Otherwise, prioritize own publications over others, and prioritize later timestamp.
     */
    filterPubs?: FilterPubsCallback;

    /**
     * Signer of publications.
     * @defaultValue digestSigning
     */
    pubSigner?: Signer;

    /**
     * Verifier of publications.
     * @defaultValue no verification
     */
    pubVerifier?: Verifier;
  }

  export type PublishCallback = (pub: Data, confirmed: boolean) => void;
}
