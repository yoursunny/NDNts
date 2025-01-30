import type { ConsumerOptions } from "@ndn/endpoint";
import type { Component, Name, Verifier } from "@ndn/packet";
import { type Subscriber, type Subscription, SubscriptionTable, SyncUpdate } from "@ndn/sync-api";
import { randomJitter } from "@ndn/util";
import { BloomFilter, type Parameters as BloomParameters } from "@yoursunny/psync-bloom";
import { TypedEventTarget } from "typescript-event-target";

import { PSyncCodec } from "./codec";
import type { PSyncCore } from "./core";
import { IBLT } from "./iblt";
import { StateFetcher } from "./state-fetcher";

type Sub = Subscription<Name, SyncUpdate<Name>>;
type Update = SyncUpdate<Name>;

interface DebugEntry {
  action: string;
}

type EventMap = {
  /** Emitted for debugging. */
  debug: CustomEvent<DebugEntry>;
  state: PartialSubscriber.StateEvent;
};

/** PSync - PartialSync subscriber. */
export class PartialSubscriber extends TypedEventTarget<EventMap>
  implements Subscriber<Name, Update, PartialSubscriber.TopicInfo> {
  constructor({
    p,
    syncPrefix,
    describe = `PartialSubscriber(${syncPrefix})`,
    cOpts,
    syncInterestLifetime = 1000,
    syncInterestInterval = [syncInterestLifetime / 2 + 100, syncInterestLifetime / 2 + 500],
    verifier,
  }: PartialSubscriber.Options) {
    super();
    this.describe = describe;
    this.helloPrefix = syncPrefix.append("hello");
    this.syncPrefix = syncPrefix.append("sync");
    this.codec = new PSyncCodec(p, IBLT.PreparedParameters.prepare(p.iblt));
    this.encodeBloom = p.encodeBloom;

    this.subs.handleRemoveTopic = this.handleRemoveTopic;

    this.cFetcher = new StateFetcher(this.describe, this.codec, syncInterestLifetime, {
      ...cOpts,
      verifier,
    });
    this.cInterval = randomJitter.between(...syncInterestInterval);

    void (async () => {
      this.bloom = await BloomFilter.create(p.bloom);
      this.scheduleInterest(0);
    })();
  }

  public readonly describe: string;
  private readonly helloPrefix: Name;
  private readonly syncPrefix: Name;
  private readonly codec: PSyncCodec;
  private readonly encodeBloom: PartialSubscriber.Parameters["encodeBloom"];
  private closed = false;

  private readonly subs = new SubscriptionTable<Update>();
  private readonly prevSeqNums = new WeakMap<object, number>();
  private bloom!: BloomFilter;
  private ibltComp?: Component;

  private readonly cFetcher: StateFetcher;
  private readonly cInterval: () => number;
  private cTimer!: NodeJS.Timeout | number;
  private cAbort?: AbortController;

  private debug(action: string): void {
    this.dispatchTypedEvent("debug", new CustomEvent<DebugEntry>("debug", {
      detail: { action },
    }));
  }

  /** Stop the protocol operation. */
  public close(): void {
    if (this.closed) {
      return;
    }
    this.closed = true;

    this.cAbort?.abort();
    this.cAbort = undefined;
    clearTimeout(this.cTimer);
  }

  public subscribe(topic: PartialSubscriber.TopicInfo): Sub {
    const { sub, objKey } = this.subs.subscribe(topic.prefix);
    if (objKey) {
      this.prevSeqNums.set(objKey, topic.seqNum);
      this.bloom.insert(this.codec.toBloomKey(topic.prefix));
    }
    return sub;
  }

  private readonly handleRemoveTopic = (topic: Name, objKey: object): void => {
    void topic;
    if (!this.prevSeqNums.delete(objKey)) {
      return;
    }

    this.bloom.clear();
    for (const [prefix, set] of this.subs.associations()) {
      if (!this.prevSeqNums.has(set)) {
        continue;
      }
      this.bloom.insert(this.codec.toBloomKey(prefix));
    }
  };

  private scheduleInterest(after = this.cInterval()) {
    clearTimeout(this.cTimer);
    this.cTimer = setTimeout(this.sendInterest, after);
  }

  private readonly sendInterest = async (): Promise<void> => {
    if (this.closed) {
      return;
    }
    this.cAbort?.abort();
    this.scheduleInterest();

    const abort = new AbortController();
    this.cAbort = abort;

    if (this.ibltComp) {
      return this.sendSyncInterest(abort);
    }
    return this.sendHelloInterest(abort);
  };

  private async sendHelloInterest(abort: AbortController): Promise<void> {
    this.debug("h-request");

    let state: PSyncCore.State;
    try {
      const { state: rState, versioned } = await this.cFetcher.fetch(this.helloPrefix, abort, "h");
      state = rState;
      this.ibltComp = versioned.at(-2);
    } catch {
      if (this.cAbort !== abort) { // aborted
        return;
      }
      this.debug("h-error");
      return;
    }

    this.debug("h-response");
    this.handleState(state);
    this.dispatchTypedEvent("state", new PartialSubscriber.StateEvent("state", state));
  }

  private async sendSyncInterest(abort: AbortController): Promise<void> {
    const name = this.syncPrefix.append(...this.encodeBloom(this.bloom), this.ibltComp!);
    this.debug("s-request");

    let state: PSyncCore.State;
    try {
      const { state: rState, versioned } = await this.cFetcher.fetch(name, abort, "s");
      // TODO test ContentType=Nack explicitly
      if (rState.length === 0) {
        this.ibltComp = undefined;
        return this.scheduleInterest(0);
      }
      state = rState;
      this.ibltComp = versioned.at(-2);
    } catch {
      if (this.cAbort !== abort) { // aborted
        return;
      }
      this.debug("s-error");
      return;
    }

    this.debug("s-response");
    this.handleState(state);
  }

  private handleState(state: PSyncCore.State): void {
    for (const { prefix, seqNum } of state) {
      const set = this.subs.list(prefix);
      if (set.size === 0) {
        continue;
      }

      const prevSeqNum = this.prevSeqNums.get(set)!;
      if (seqNum <= prevSeqNum) {
        continue;
      }
      this.prevSeqNums.set(set, seqNum);

      this.subs.update(set, new SyncUpdate({
        id: prefix,
        seqNum,
        remove: () => undefined,
      }, prevSeqNum + 1, seqNum));
    }
  }
}

export namespace PartialSubscriber {
  /** Algorithm parameters. */
  export interface Parameters extends PSyncCore.Parameters, PSyncCodec.Parameters {
    bloom: BloomParameters;
  }

  /** {@link PartialSubscriber} constructor options. */
  export interface Options {
    /**
     * Algorithm parameters.
     *
     * @remarks
     * They must match the publisher parameters.
     */
    p: Parameters;

    /** Sync producer prefix. */
    syncPrefix: Name;

    /**
     * Description for debugging purpose.
     * @defaultValue PartialSubscriber + syncPrefix
     */
    describe?: string;

    /**
     * Consumer options.
     *
     * @remarks
     * - `.describe` is overridden as {@link Options.describe}.
     * - `.modifyInterest` is overridden.
     * - `.retx` is overridden.
     * - `.signal` is overridden.
     * - `.verifier` is overridden.
     */
    cOpts?: ConsumerOptions;

    /**
     * Sync Interest lifetime in milliseconds.
     * @defaultValue 1000
     */
    syncInterestLifetime?: number;

    /**
     * Interval between sync Interests, randomized within the range, in milliseconds.
     * @defaultValue `[syncInterestLifetime/2+100,syncInterestLifetime/2+500]`
     */
    syncInterestInterval?: [min: number, max: number];

    /**
     * Verifier of sync reply Data packets.
     * @defaultValue no verification
     */
    verifier?: Verifier;
  }

  export interface TopicInfo extends PSyncCore.PrefixSeqNum {}

  export class StateEvent extends Event {
    constructor(
        type: string,
        public readonly topics: readonly TopicInfo[],
    ) {
      super(type);
    }
  }
}
