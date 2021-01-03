import { Endpoint, Producer } from "@ndn/endpoint";
import { Data, Interest, Name, Signer, Verifier } from "@ndn/packet";
import { discoverVersion, fetch } from "@ndn/segmented-object";
import { toHex } from "@ndn/tlv";
import { AbortController } from "abort-controller";
import { EventEmitter } from "events";
import assert from "minimalistic-assert";
import pDefer from "p-defer";
import type TypedEmitter from "typed-emitter";

import { UplinkRouteMirror } from "../detail/uplink-route-mirror";
import type { IBLT } from "../iblt";
import { SyncNode, SyncProtocol, SyncUpdate } from "../types";
import { PSyncCodec } from "./codec";
import { PSyncCore, PSyncNode } from "./core";
import { PSyncStateProducerBuffer } from "./state-producer-buffer";

interface PendingInterest {
  interest: Interest;
  recvIblt: IBLT;
  expire: NodeJS.Timeout;
  defer: pDefer.DeferredPromise<Data|undefined>;
}

interface DebugEntry {
  action: string;
  ownIblt: IBLT;
  recvIblt?: IBLT;
  state?: PSyncCore.State;
}

interface Events extends SyncProtocol.Events<Name> {
  debug: (entry: DebugEntry) => void;
}

/** PSync - FullSync participant. */
export class PSyncFull extends (EventEmitter as new() => TypedEmitter<Events>) implements SyncProtocol<Name> {
  constructor({
    p,
    endpoint = new Endpoint(),
    describe,
    syncPrefix,
    addSyncPrefixOnUplinks = true,
    syncReplyFreshness = 1000,
    signer,
    producerBufferLimit = 32,
    syncInterestLifetime = 1000,
    syncInterestInterval,
    verifier,
  }: PSyncFull.Options) {
    super();
    this.endpoint = endpoint;
    this.describe = describe ?? `PSyncFull(${syncPrefix})`;
    this.syncPrefix = syncPrefix;
    this.c = new PSyncCore(p);
    this.c.onIncreaseSeqNum = this.handleIncreaseSeqNum;
    this.codec = new PSyncCodec(p, this.c);
    if (addSyncPrefixOnUplinks) {
      this.uplinkRouteMirror = new UplinkRouteMirror(endpoint.fw, syncPrefix);
    }

    this.pFreshness = syncReplyFreshness;
    this.pBuffer = new PSyncStateProducerBuffer(this.endpoint, this.describe, this.codec,
      signer, producerBufferLimit);
    this.pProducer = endpoint.produce(syncPrefix, this.handleSyncInterest, {
      describe: `${this.describe}[p]`,
      concurrency: Infinity,
    });

    this.cLifetime = syncInterestLifetime;
    this.cInterval = ((): [number, number] => {
      if (syncInterestInterval) {
        const [min, max] = syncInterestInterval;
        assert(min <= max);
        return [min, max - min];
      }
      return [syncInterestLifetime / 2 + 100, syncInterestLifetime / 2 + 500];
    })();
    this.cVerifier = verifier;
    this.scheduleSyncInterest(0);
  }

  private readonly endpoint: Endpoint;
  public readonly describe: string;
  private readonly syncPrefix: Name;
  private readonly c: PSyncCore;
  private readonly codec: PSyncCodec;
  private readonly uplinkRouteMirror?: UplinkRouteMirror;
  private closed = false;

  private readonly pFreshness: number;
  private readonly pBuffer: PSyncStateProducerBuffer;
  private readonly pProducer: Producer;
  private readonly pPendings = new Map<string, PendingInterest>(); // toHex(ibltComp.value) => PI

  private readonly cLifetime: number;
  private readonly cInterval: [min: number, range: number];
  private readonly cVerifier?: Verifier;
  private cTimer: NodeJS.Timeout = 0 as any;
  private cAbort?: AbortController;
  private cCurrentInterestName?: Name;

  private debug(action: string, recvIblt?: IBLT, state?: PSyncCore.State): void {
    if (this.listenerCount("debug") === 0) {
      return;
    }
    this.emit("debug", {
      action,
      ownIblt: this.c.iblt.clone(),
      recvIblt: recvIblt?.clone(),
      state,
    });
  }

  public close(): void {
    if (this.closed) {
      return;
    }
    this.closed = true;

    for (const pending of this.pPendings.values()) {
      clearTimeout(pending.expire);
    }
    this.pBuffer.close();
    this.pProducer.close();

    this.cAbort?.abort();
    this.cAbort = undefined;
    clearTimeout(this.cTimer);

    this.uplinkRouteMirror?.close();
  }

  public get(prefix: Name): SyncNode<Name>|undefined {
    return this.c.get(prefix);
  }

  public add(prefix: Name): SyncNode<Name> {
    return this.c.add(prefix);
  }

  private handleSyncInterest = async (interest: Interest): Promise<Data|undefined> => {
    if (interest.name.length !== this.syncPrefix.length + 1) {
      // segment Interest should be satisfied by PSyncStateProducerBuffer
      return undefined;
    }

    const ibltComp = interest.name.at(this.syncPrefix.length);
    const ibltCompHex = toHex(ibltComp.value);
    if (this.pPendings.has(ibltCompHex)) {
      // same as a pending Interest; if it could be answered, it would have been answered
      return undefined;
    }

    const recvIblt = this.codec.comp2iblt(ibltComp);
    const { success, positive, negative, total } = this.c.iblt.diff(recvIblt);
    if (!success && (total >= this.c.threshold || total === 0)) {
      const state = this.c.list(({ seqNum }) => seqNum > 0);
      if (state.length === 0) {
        this.debug("p-empty", recvIblt);
        return undefined;
      }
      return this.sendSyncData(interest, state, "p-full", recvIblt);
    }

    const state = this.c.list(({ id: prefix, seqNum, key }) => {
      return seqNum > 0 &&
             positive.has(key) &&
             !negative.has(this.c.joinPrefixSeqNum({ prefix, seqNum: seqNum + 1 }).hash);
    });
    if (state.length > 0) {
      return this.sendSyncData(interest, state, "p-diff", recvIblt);
    }

    this.debug("p-save", recvIblt);
    const pending: PendingInterest = {
      interest,
      recvIblt,
      expire: setTimeout(() => {
        if (this.pPendings.delete(ibltCompHex)) {
          this.debug("p-expire", recvIblt);
          pending.defer.resolve(undefined);
        }
      }, interest.lifetime),
      defer: pDefer<Data|undefined>(),
    };
    this.pPendings.set(ibltCompHex, pending);
    return pending.defer.promise;
  };

  private handleIncreaseSeqNum = (node: PSyncNode) => {
    this.debug(`+(${node.id},${node.seqNum})`);

    for (const [ibltCompHex, { interest, recvIblt, expire, defer }] of this.pPendings) {
      const { success, positive, total } = this.c.iblt.diff(recvIblt);
      if (!success && (total >= this.c.threshold || total === 0)) {
        // XXX PSync C++ library deletes the pending entry here
        continue;
      }

      const state = this.c.list(({ seqNum, key }) => {
        return seqNum > 0 && positive.has(key);
      });
      if (state.length > 0 && this.pPendings.delete(ibltCompHex)) {
        clearTimeout(expire);
        defer.resolve(this.sendSyncData(interest, state, "p-satisfy", recvIblt));
      }
    }
  };

  private async sendSyncData(interest: Interest, state: PSyncCore.State, action: string, recvIblt: IBLT): Promise<Data|undefined> {
    this.debug(action, recvIblt, state);
    if (this.cCurrentInterestName?.equals(interest.name)) {
      this.scheduleSyncInterest(0);
    }

    const server = this.pBuffer.add(interest.name.append(...this.codec.uselessCompsAfterIblt),
      state, this.pFreshness);
    return server.processInterest(interest);
  }

  private scheduleSyncInterest(after = this.cInterval[0] + Math.random() * this.cInterval[1]) {
    this.cCurrentInterestName = undefined;
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
    const ibltComp = this.codec.iblt2comp(this.c.iblt);
    const name = this.syncPrefix.append(ibltComp);
    this.cCurrentInterestName = name;
    this.debug("c-request");

    let state: PSyncCore.State;
    try {
      const versioned = await discoverVersion(name, {
        endpoint: this.endpoint,
        describe: `${this.describe}[cv]`,
        versionConvention: this.codec.versionConvention,
        segmentNumConvention: this.codec.segmentNumConvention,
        expectedSuffixLen: 2 + this.codec.nUselessCompsAfterIblt,
        modifyInterest: { lifetime: this.cLifetime },
        retxLimit: 0,
        signal: this.cAbort.signal,
        verifier: this.cVerifier,
      });
      const payload = await fetch(versioned, {
        endpoint: this.endpoint,
        describe: `${this.describe}[cf]`,
        segmentNumConvention: this.codec.segmentNumConvention,
        modifyInterest: { lifetime: this.cLifetime },
        retxLimit: 0,
        signal: this.cAbort.signal,
        verifier: this.cVerifier,
      });
      state = this.codec.buffer2state(payload);
    } catch {
      if (this.cAbort !== abort) { // aborted
        return;
      }
      this.debug("c-error");
      // XXX PSync C++ library schedules an earlier retry here
      return;
    }

    this.debug("c-response", undefined, state);
    let hasUpdates = false;
    for (const { prefix, seqNum } of state) {
      const node = this.c.add(prefix);
      const prevSeqNum = node.seqNum;
      if (prevSeqNum >= seqNum) {
        continue;
      }
      node.setSeqNum(seqNum, false);

      hasUpdates = true;
      this.emit("update", new SyncUpdate(node, prevSeqNum + 1, seqNum));
    }
    this.debug("c-processed");

    const ibltCompHex = toHex(ibltComp.value);
    const pending = this.pPendings.get(ibltCompHex);
    if (pending && this.pPendings.delete(ibltCompHex)) {
      pending.defer.resolve(undefined);
    }
    if (hasUpdates) {
      this.scheduleSyncInterest(0);
    }
  };
}

export namespace PSyncFull {
  export interface Parameters extends PSyncCore.Parameters, PSyncCodec.Parameters {

  }

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
     * FreshnessPeriod of sync reply Data packet.
     * @default 1000
     */
    syncReplyFreshness?: number;

    /**
     * Signer of sync reply Data packets.
     * Default is digest signing.
     */
    signer?: Signer;

    /**
     * How many sync reply segmented objects to keep in buffer.
     * This must be positive.
     * @default 32
     */
    producerBufferLimit?: number;

    /**
     * Sync Interest lifetime in milliseconds.
     * @default 1000
     */
    syncInterestLifetime?: number;

    /**
     * Interval between sync Interests, randomized within the range, in milliseconds.
     * @default [syncInterestLifetime/2+100,syncInterestLifetime/2+500]
     */
    syncInterestInterval?: [min: number, max: number];

    /**
     * Verifier of sync reply Data packets.
     * Default is no verification.
     */
    verifier?: Verifier;
  }
}
