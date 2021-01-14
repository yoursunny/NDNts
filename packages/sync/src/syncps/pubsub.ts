import { Endpoint, Producer } from "@ndn/endpoint";
import { Timestamp } from "@ndn/naming-convention2";
import { Data, digestSigning, Interest, lpm, Name, Signer, Verifier } from "@ndn/packet";
import { toHex } from "@ndn/tlv";
import { AbortController } from "abort-controller";
import { EventEmitter } from "events";
import DefaultWeakMap from "mnemonist/default-weak-map";
import pDefer from "p-defer";
import type TypedEmitter from "typed-emitter";

import { SubscriptionTable } from "../detail/subscription-table";
import { UplinkRouteMirror } from "../detail/uplink-route-mirror";
import { IBLT } from "../iblt";
import type { Subscriber, Subscription } from "../types";
import { SyncpsCodec } from "./codec";

interface PublicationEntry {
  key: number;
  pub: Data;
  cb?: SyncpsPubsub.PublishCallback;

  own: boolean;
  expired: boolean;

  timers: NodeJS.Timeout[];
}

interface SyncInterestInfo {
  interest: Interest;
  recvIblt: IBLT;
}

interface PendingInterest extends SyncInterestInfo {
  expire: NodeJS.Timeout;
  defer: pDefer.DeferredPromise<Data|undefined>;
}

interface DebugEntry {
  action: string;
  key?: number;
  name?: Name;
  ownIblt: IBLT;
  recvIblt?: IBLT;
  content?: Name[];
}

interface Events {
  debug: (entry: DebugEntry) => void;
}

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
  return items.sort((a, b) => {
    if (a.own !== b.own) {
      return a.own ? -1 : 1;
    }
    return timestampMap.get(b.pub) - timestampMap.get(a.pub);
  });
}

/** syncps - pubsub service. */
export class SyncpsPubsub extends (EventEmitter as new() => TypedEmitter<Events>)
  implements Subscriber<Name, Data> {
  constructor({
    p,
    endpoint = new Endpoint(),
    describe,
    syncPrefix,
    addSyncPrefixOnUplinks = true,
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
    this.endpoint = endpoint;
    this.describe = describe ?? `SyncpsPubsub(${syncPrefix})`;
    this.syncPrefix = syncPrefix;
    const ibltParams = IBLT.PreparedParameters.prepare(p.iblt);
    this.codec = new SyncpsCodec(p, ibltParams);
    if (addSyncPrefixOnUplinks) {
      this.uplinkRouteMirror = new UplinkRouteMirror(endpoint.fw, syncPrefix);
    }

    this.iblt = new IBLT(ibltParams);
    this.maxPubLifetime = maxPubLifetime;
    this.maxClockSkew = maxClockSkew;
    this.dModify = modifyPublication;
    this.dIsExpired = isExpired;
    this.dSigner = pubSigner;
    this.dVerifier = pubVerifier;
    this.dConfirmIblt = new IBLT(ibltParams);

    this.pProducer = endpoint.produce(syncPrefix, this.handleSyncInterest, {
      describe: `${this.describe}[p]`,
      concurrency: Infinity,
      dataSigner: syncSigner,
    });
    this.pFilter = filterPubs;
    this.pPubSize = syncDataPubSize;

    this.cVerifier = syncVerifier;
    this.cLifetime = syncInterestLifetime;

    this.scheduleSyncInterest(0);
  }

  private readonly endpoint: Endpoint;
  public readonly describe: string;
  private readonly syncPrefix: Name;
  private readonly codec: SyncpsCodec;
  private readonly uplinkRouteMirror?: UplinkRouteMirror;
  private closed = false;

  private readonly iblt: IBLT;
  private readonly pubs = new Map<number, PublicationEntry>();
  private readonly maxPubLifetime: number;
  private readonly maxClockSkew: number;
  private readonly subs = new SubscriptionTable<Name, Data>((topic) => toHex(topic.value));

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
  private readonly pPendings = new Map<string, PendingInterest>(); // toHex(ibltComp.value) => PI

  private readonly cVerifier?: Verifier;
  private readonly cLifetime: number;
  private cAbort?: AbortController;
  private cTimer!: NodeJS.Timeout;
  private cCurrentInterestNonce?: number;
  private cDelivering = false;

  private debug(action: string, key?: number, pub?: Data): void;
  private debug(action: string, recvIblt?: IBLT, content?: readonly Data[], contentFirst?: number): void;
  private debug(action: string, arg2?: number|IBLT, arg3?: Data|readonly Data[], contentFirst = 0): void {
    if (this.listenerCount("debug") === 0) {
      return;
    }
    this.emit("debug", {
      action,
      key: typeof arg2 === "number" ? arg2 : undefined,
      name: arg3 instanceof Data ? arg3.name : undefined,
      ownIblt: this.iblt.clone(),
      recvIblt: typeof arg2 === "object" ? arg2.clone() : undefined,
      content: Array.isArray(arg3) ? (arg3 as readonly Data[]).slice(0, contentFirst).map(({ name }) => name) : undefined,
    });
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

    this.uplinkRouteMirror?.close();
  }

  /**
   * Publish a packet.
   * @param pub a Data packet. This does not need to be signed.
   * @param cb a callback to get notified whether publication is confirmed,
   *           i.e. its hash appears in a sync Interest from another participant.
   * @returns a Promise that resolves when the publication is recorded.
   *          It does not mean the publication has reached other participants.
   */
  public async publish(pub: Data, cb?: SyncpsPubsub.PublishCallback): Promise<void> {
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

  /**
   * Subscribe to a topic.
   * @param topic a name prefix.
   */
  public subscribe(topic: Name): Subscription<Name, Data> {
    return this.subs.add(topic, undefined);
  }

  private handleSyncInterest = async (interest: Interest): Promise<Data|undefined> => {
    if (interest.name.length !== this.syncPrefix.length + 1) {
      return undefined;
    }
    if (interest.nonce === this.cCurrentInterestNonce) {
      return undefined;
    }

    const ibltComp = interest.name.at(this.syncPrefix.length);
    const ibltCompHex = toHex(ibltComp.value);
    if (this.pPendings.has(ibltCompHex)) {
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
        if (this.pPendings.delete(ibltCompHex)) {
          pending.defer.resolve(undefined);
        }
      }, interest.lifetime),
      defer: pDefer<Data|undefined>(),
    };
    this.pPendings.set(ibltCompHex, pending);
    return pending.defer.promise;
  };

  private processSyncInterest({ interest, recvIblt }: SyncInterestInfo): Data|undefined {
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
    for (const [ibltCompHex, pending] of this.pPendings) {
      const data = this.processSyncInterest(pending);
      if (!data) {
        continue;
      }
      if (this.pPendings.delete(ibltCompHex)) {
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
      const data = await this.endpoint.consume(interest, {
        describe: `${this.describe}[c]`,
        signal: abort.signal,
        verifier: this.cVerifier,
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
        const sub = lpm(pub.name, (prefixHex) => this.subs.get(prefixHex));
        if (sub) {
          this.debug("c-deliver", key, pub);
          this.subs.update(sub, pub);
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
   * The callback can return either:
   * - boolean to indicate whether the publication is expired.
   * - number, interpreted as Unix timestamp (milliseconds) of publication creation time.
   *   The publication is considered expired if this timestamp is before
   *   `NOW - (maxPubLifetime+maxClockSkew)` or after `NOW + maxClockSkew`.
   */
  export type IsExpiredCallback = (pub: Data) => boolean|number;

  export interface FilterPubItem {
    /** A publication, i.e. Data packet. */
    readonly pub: Data;

    /** Whether the publication is owned by the local participant. */
    readonly own: boolean;
  }

  /**
   * Callback to decide what publications to be included in a response.
   * Argument contains unexpired publications only.
   * It should return a priority list of publications to be included in the response.
   */
  export type FilterPubsCallback = (items: FilterPubItem[]) => FilterPubItem[];

  export interface Options {
    /**
     * Algorithm parameters.
     * They must be the same on every peer.
     */
    p: Parameters;

    /** Endpoint for communication. */
    endpoint?: Endpoint;

    /** Description for debugging purpose. */
    describe?: string;

    /** Sync group prefix. */
    syncPrefix: Name;

    /**
     * Whether to automatically add sync group prefix as a route on uplinks.
     * @default true
     */
    addSyncPrefixOnUplinks?: boolean;

    /**
     * Sync Interest lifetime in milliseconds.
     * @default 4000
     */
    syncInterestLifetime?: number;

    /**
     * Advisory maximum size for publications included in a sync reply Data packet.
     * @default 1300
     */
    syncDataPubSize?: number;

    /**
     * Signer of sync reply Data packets.
     * Default is digest signing.
     */
    syncSigner?: Signer;

    /**
     * Verifier of sync reply Data packets.
     * Default is no verification.
     */
    syncVerifier?: Verifier;

    /**
     * Publication lifetime.
     * @default 1000
     */
    maxPubLifetime?: number;

    /**
     * Maximum clock skew, for calculating timers.
     * @default 1000
     */
    maxClockSkew?: number;

    /**
     * Callback to modify publication before it's signed.
     * Default is appending a TimestampNameComponent to the name.
     */
    modifyPublication?: ModifyPublicationCallback;

    /**
     * Callback to determine if a publication is expired.
     * Default is interpreting the last component as TimestampNameComponent;
     * if the last component is not a TimestampNameComponent, it is seen as expired.
     */
    isExpired?: IsExpiredCallback;

    /**
     * Callback to decide what publications to be included in a response.
     * Default is: respond nothing if there's no own publication; otherwise,
     * prioritize own publications over others, and prioritize later timestamp.
     */
    filterPubs?: FilterPubsCallback;

    /**
     * Signer of publications.
     * Default is digest signing.
     */
    pubSigner?: Signer;

    /**
     * Verifier of publications.
     * Default is no verification.
     */
    pubVerifier?: Verifier;
  }

  export type PublishCallback = (pub: Data, confirmed: boolean) => void;
}
