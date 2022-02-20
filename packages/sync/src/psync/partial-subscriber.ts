import { Endpoint } from "@ndn/endpoint";
import { Component, Name, Verifier } from "@ndn/packet";
import { toHex } from "@ndn/util";
import { type Parameters as BloomParameters, BloomFilter } from "@yoursunny/psync-bloom";
import { EventEmitter } from "node:events";
import type TypedEmitter from "typed-emitter";

import { type IntervalFunc, computeInterval } from "../detail/interval";
import { SubscriptionTable } from "../detail/subscription-table";
import { IBLT } from "../iblt";
import { type Subscriber, type Subscription, SyncUpdate } from "../types";
import { PSyncCodec } from "./codec";
import { PSyncCore } from "./core";
import { PSyncStateFetcher } from "./state-fetcher";

type Sub = Subscription<Name, SyncUpdate<Name>>;
type Update = SyncUpdate<Name>;

interface DebugEntry {
  action: string;
}

type Events = {
  debug: (entry: DebugEntry) => void;
  state: (topics: readonly PSyncPartialSubscriber.TopicInfo[]) => void;
};

/** PSync - PartialSync subscriber. */
export class PSyncPartialSubscriber extends (EventEmitter as new() => TypedEmitter<Events>)
  implements Subscriber<Name, Update, PSyncPartialSubscriber.TopicInfo> {
  constructor({
    p,
    endpoint = new Endpoint(),
    describe,
    syncPrefix,
    syncInterestLifetime = 1000,
    syncInterestInterval,
    verifier,
  }: PSyncPartialSubscriber.Options) {
    super();
    this.describe = describe ?? `PSyncPartialSubscriber(${syncPrefix})`;
    this.helloPrefix = syncPrefix.append("hello");
    this.syncPrefix = syncPrefix.append("sync");
    this.codec = new PSyncCodec(p, IBLT.PreparedParameters.prepare(p.iblt));
    this.encodeBloom = p.encodeBloom;

    this.subs.handleAddTopic = this.handleAddTopic;
    this.subs.handleRemoveTopic = this.handleRemoveTopic;

    this.cFetcher = new PSyncStateFetcher(endpoint, this.describe, this.codec, syncInterestLifetime, verifier);
    this.cInterval = computeInterval(syncInterestInterval, syncInterestLifetime);

    void (async () => {
      this.bloom = await BloomFilter.create(p.bloom);
      this.scheduleInterest(0);
    })();
  }

  public readonly describe: string;
  private readonly helloPrefix: Name;
  private readonly syncPrefix: Name;
  private readonly codec: PSyncCodec;
  private readonly encodeBloom: PSyncPartialSubscriber.Parameters["encodeBloom"];
  private closed = false;

  private readonly subs = new SubscriptionTable<Name, Update, string, PSyncPartialSubscriber.TopicInfo>((topic) => toHex(topic.value));
  private readonly prevSeqNums = new WeakMap<Set<Sub>, number>();
  private bloom!: BloomFilter;
  private ibltComp?: Component;

  private readonly cFetcher: PSyncStateFetcher;
  private readonly cInterval: IntervalFunc;
  private cTimer!: NodeJS.Timeout;
  private cAbort?: AbortController;

  private debug(action: string): void {
    this.emit("debug", {
      action,
    });
  }

  /** Stop the protocol operation. */
  public close(): void {
    if (this.closed) {
      return;
    }
    this.closed = true;

    this.bloom.dispose();

    this.cAbort?.abort();
    this.cAbort = undefined;
    clearTimeout(this.cTimer);
  }

  public subscribe(topic: PSyncPartialSubscriber.TopicInfo): Sub {
    return this.subs.add(topic.prefix, topic);
  }

  private handleAddTopic = (prefix: Name, topicHex: string, set: Set<Sub>, { seqNum }: PSyncPartialSubscriber.TopicInfo): void => {
    this.prevSeqNums.set(set, seqNum);
    this.bloom.insert(this.codec.toBloomKey(prefix));
  };

  private handleRemoveTopic = (topic: Name, topicHex: string, set: Set<Sub>): void => {
    if (!this.prevSeqNums.delete(set)) {
      return;
    }

    this.bloom.clear();
    for (const [, set] of this.subs) {
      if (!this.prevSeqNums.has(set)) {
        continue;
      }

      let prefix!: Name;
      for (const sub of set) { // eslint-disable-line no-unreachable-loop
        prefix = sub.topic;
        break;
      }
      this.bloom.insert(this.codec.toBloomKey(prefix));
    }
  };

  private scheduleInterest(after = this.cInterval()) {
    clearTimeout(this.cTimer);
    this.cTimer = setTimeout(this.sendInterest, after);
  }

  private sendInterest = async (): Promise<void> => {
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
    this.emit("state", state);
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
      const key = toHex(prefix.value);
      const set = this.subs.get(key);
      if (!set) {
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

export namespace PSyncPartialSubscriber {
  export interface Parameters extends PSyncCore.Parameters, PSyncCodec.Parameters {
    bloom: BloomParameters;
  }

  export interface Options {
    /**
     * Algorithm parameters.
     * They must match the publisher parameters.
     */
    p: Parameters;

    /** Endpoint for communication. */
    endpoint?: Endpoint;

    /** Description for debugging purpose. */
    describe?: string;

    /** Sync producer prefix. */
    syncPrefix: Name;

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

  export interface TopicInfo extends PSyncCore.PrefixSeqNum {}
}
