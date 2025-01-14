import { ConsumerOptions, produce, type Producer, type ProducerHandler, ProducerOptions } from "@ndn/endpoint";
import { GenericNumber } from "@ndn/naming-convention2";
import type { Component, Data, Interest, Name, Signer, Verifier } from "@ndn/packet";
import { type SyncNode, type SyncProtocol, SyncUpdate } from "@ndn/sync-api";
import { KeyMap, toHex, trackEventListener } from "@ndn/util";
import { TypedEventTarget } from "typescript-event-target";

import { computeInterval, type IntervalFunc, type IntervalRange } from "../detail/interval";
import type { IBLT } from "../iblt";
import { PSyncCodec } from "./codec";
import { PSyncCore, type PSyncNode } from "./core";
import { StateFetcher } from "./state-fetcher";
import { StateProducerBuffer } from "./state-producer-buffer";

interface PendingInterest {
  interest: Interest;
  recvIblt: IBLT;
  expire: NodeJS.Timeout | number;
  defer: PromiseWithResolvers<Data | undefined>;
}

interface DebugEntry {
  action: string;
  ownIblt: IBLT;
  recvIblt?: IBLT;
  state?: PSyncCore.State;
}

type EventMap = SyncProtocol.EventMap<Name> & {
  debug: CustomEvent<DebugEntry>;
};

/** PSync - FullSync participant. */
export class FullSync extends TypedEventTarget<EventMap> implements SyncProtocol<Name> {
  constructor({
    p,
    syncPrefix,
    describe = `FullSync(${syncPrefix})`,
    cpOpts,
    syncReplyFreshness = 1000,
    signer,
    producerBufferLimit = 32,
    syncInterestLifetime = 1000,
    syncInterestInterval,
    verifier,
  }: FullSync.Options) {
    super();
    this.describe = describe;
    this.syncPrefix = syncPrefix;
    this.c = new PSyncCore(p);
    this.c.onIncreaseSeqNum = this.handleIncreaseSeqNum;
    this.codec = new PSyncCodec(p, this.c.ibltParams);

    this.pFreshness = syncReplyFreshness;
    this.pBuffer = new StateProducerBuffer(this.describe, this.codec, producerBufferLimit, {
      ...ProducerOptions.exact(cpOpts),
      dataSigner: signer,
    });
    this.pProducer = produce(syncPrefix, this.handleSyncInterest, {
      ...ProducerOptions.exact(cpOpts),
      describe: `${describe}[p]`,
      routeCapture: false,
      concurrency: Infinity,
    });

    this.cFetcher = new StateFetcher(this.describe, this.codec, syncInterestLifetime, {
      ...ConsumerOptions.exact(cpOpts),
      describe,
      verifier,
    });
    this.cInterval = computeInterval(syncInterestInterval, syncInterestLifetime);
    this.scheduleSyncInterest(0);
  }

  private readonly maybeHaveEventListener = trackEventListener(this);
  public readonly describe: string;
  private readonly syncPrefix: Name;
  private readonly c: PSyncCore;
  private readonly codec: PSyncCodec;
  private closed = false;

  private readonly pFreshness: number;
  private readonly pBuffer: StateProducerBuffer;
  private readonly pProducer: Producer;
  private readonly pPendings = new KeyMap<Component, PendingInterest, string>((c) => toHex(c.value));

  private readonly cFetcher: StateFetcher;
  private readonly cInterval: IntervalFunc;
  private cTimer!: NodeJS.Timeout | number;
  private cAbort?: AbortController;
  private cCurrentInterestName?: Name;

  private debug(action: string, recvIblt?: IBLT, state?: PSyncCore.State): void {
    if (!this.maybeHaveEventListener.debug) {
      return;
    }
    /* c8 ignore next */
    this.dispatchTypedEvent("debug", new CustomEvent<DebugEntry>("debug", {
      detail: {
        action,
        ownIblt: this.c.iblt.clone(),
        recvIblt: recvIblt?.clone(),
        state,
      },
    }));
  }

  /** Stop the protocol operation. */
  public close(): void {
    if (this.closed) {
      return;
    }
    this.closed = true;

    for (const [, pending] of this.pPendings) {
      clearTimeout(pending.expire);
    }
    this.pBuffer.close();
    this.pProducer.close();

    this.cAbort?.abort();
    this.cAbort = undefined;
    clearTimeout(this.cTimer);
  }

  public get(prefix: Name): SyncNode<Name> | undefined {
    return this.c.get(prefix);
  }

  public add(prefix: Name): SyncNode<Name> {
    return this.c.add(prefix);
  }

  private handleSyncInterest: ProducerHandler = async (interest) => {
    if (interest.name.length !== this.syncPrefix.length + 2) {
      // segment Interest should be satisfied by StateProducerBuffer
      return undefined;
    }

    const ibltComp = interest.name.at(this.syncPrefix.length);
    if (this.pPendings.has(ibltComp)) {
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

    const state = this.c.list(({ id: prefix, seqNum, key }) => seqNum > 0 &&
             positive.has(key) &&
             !negative.has(this.c.joinPrefixSeqNum({ prefix, seqNum: seqNum + 1 }).hash));
    if (state.length > 0) {
      return this.sendSyncData(interest, state, "p-diff", recvIblt);
    }

    this.debug("p-save", recvIblt);
    const pending: PendingInterest = {
      interest,
      recvIblt,
      expire: setTimeout(() => {
        if (this.pPendings.delete(ibltComp)) {
          this.debug("p-expire", recvIblt);
          pending.defer.resolve(undefined);
        }
      }, interest.lifetime),
      defer: Promise.withResolvers<Data | undefined>(),
    };
    this.pPendings.set(ibltComp, pending);
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

      const state = this.c.list(({ seqNum, key }) => seqNum > 0 && positive.has(key));
      if (state.length > 0 && this.pPendings.delete(ibltCompHex)) {
        clearTimeout(expire);
        defer.resolve(this.sendSyncData(interest, state, "p-satisfy", recvIblt));
      }
    }
  };

  private async sendSyncData(interest: Interest, state: PSyncCore.State, action: string, recvIblt: IBLT): Promise<Data | undefined> {
    this.debug(action, recvIblt, state);
    if (this.cCurrentInterestName?.equals(interest.name)) {
      this.scheduleSyncInterest(0);
    }

    const server = this.pBuffer.add(interest.name, state, this.pFreshness);
    return server.processInterest(interest);
  }

  private scheduleSyncInterest(after = this.cInterval()) {
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
    const name = this.syncPrefix.append(ibltComp, GenericNumber.create(this.c.sumSeqNum));
    this.cCurrentInterestName = name;
    this.debug("c-request");

    let state: PSyncCore.State;
    try {
      ({ state } = await this.cFetcher.fetch(name, abort));
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
      this.dispatchTypedEvent("update", new SyncUpdate(node, prevSeqNum + 1, seqNum));
    }
    this.debug("c-processed");

    const pending = this.pPendings.get(ibltComp);
    if (pending && this.pPendings.delete(ibltComp)) {
      pending.defer.resolve(undefined);
    }
    if (hasUpdates) {
      this.scheduleSyncInterest(0);
    }
  };
}

export namespace FullSync {
  export interface Parameters extends PSyncCore.Parameters, PSyncCodec.Parameters {
  }

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
     * @defaultValue FullSync + syncPrefix
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
     * FreshnessPeriod of sync reply Data packet.
     * @defaultValue 1000
     */
    syncReplyFreshness?: number;

    /**
     * Signer of sync reply Data packets.
     * @defaultValue digestSigning
     */
    signer?: Signer;

    /**
     * How many sync reply segmented objects to keep in buffer.
     * This must be a positive integer.
     * @defaultValue 32
     */
    producerBufferLimit?: number;

    /**
     * Sync Interest lifetime in milliseconds.
     * @defaultValue 1000
     */
    syncInterestLifetime?: number;

    /**
     * Interval between sync Interests, randomized within the range, in milliseconds.
     * @defaultValue `[syncInterestLifetime/2+100,syncInterestLifetime/2+500]`
     */
    syncInterestInterval?: IntervalRange;

    /**
     * Verifier of sync reply Data packets.
     * @defaultValue no verification
     */
    verifier?: Verifier;
  }
}
