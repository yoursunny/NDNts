import { type ProducerHandler, Endpoint, Producer } from "@ndn/endpoint";
import { Segment } from "@ndn/naming-convention2";
import { type Signer, Data, Interest, Name } from "@ndn/packet";
import { toHex } from "@ndn/util";
import { BloomFilter } from "@yoursunny/psync-bloom";
import { EventEmitter } from "node:events";
import pDefer, { DeferredPromise } from "p-defer";
import type TypedEmitter from "typed-emitter";

import { IBLT } from "../iblt";
import type { SyncNode, SyncProtocol } from "../types";
import { PSyncCodec } from "./codec";
import { PSyncCore, PSyncNode } from "./core";
import { PSyncStateProducerBuffer } from "./state-producer-buffer";

interface PendingInterest {
  interest: Interest;
  recvIblt: IBLT;
  bloom: BloomFilter;
  expire: NodeJS.Timeout;
  defer: DeferredPromise<Data | undefined>;
}

interface DebugEntry {
  action: string;
  interestName?: Name;
}

type Events = SyncProtocol.Events<Name> & {
  debug: (entry: DebugEntry) => void;
};

/** PSync - PartialSync publisher. */
export class PSyncPartialPublisher extends (EventEmitter as new() => TypedEmitter<Events>)
  implements SyncProtocol<Name> {
  constructor({
    p,
    endpoint = new Endpoint(),
    describe,
    syncPrefix,
    helloReplyFreshness = 1000,
    syncReplyFreshness = 1000,
    signer,
    producerBufferLimit = 32,
  }: PSyncPartialPublisher.Options) {
    super();
    this.endpoint = endpoint;
    this.describe = describe ?? `PSyncPartialPublisher(${syncPrefix})`;
    this.syncPrefix = syncPrefix;
    this.c = new PSyncCore(p);
    this.c.onIncreaseSeqNum = this.handleIncreaseSeqNum;
    this.codec = new PSyncCodec(p, this.c.ibltParams);

    this.pBuffer = new PSyncStateProducerBuffer(this.endpoint, this.describe, this.codec,
      signer, producerBufferLimit);
    this.hFreshness = helloReplyFreshness;
    this.hProducer = endpoint.produce(syncPrefix.append("hello"), this.handleHelloInterest, {
      describe: `${this.describe}[h]`,
      concurrency: Infinity,
      announcement: syncPrefix,
    });
    this.sFreshness = syncReplyFreshness;
    this.sProducer = endpoint.produce(syncPrefix.append("sync"), this.handleSyncInterest, {
      describe: `${this.describe}[s]`,
      concurrency: Infinity,
      announcement: syncPrefix,
    });
  }

  private readonly endpoint: Endpoint;
  public readonly describe: string;
  private readonly syncPrefix: Name;
  private readonly c: PSyncCore;
  private readonly codec: PSyncCodec;
  private closed = false;

  private readonly pBuffer: PSyncStateProducerBuffer;
  private readonly hFreshness: number;
  private readonly hProducer: Producer;
  private readonly sFreshness: number;
  private readonly sProducer: Producer;
  private readonly sPendings = new Map<string, PendingInterest>(); // toHex(name.value) => PI

  private debug(action: string, interest?: Interest): void {
    if (this.listenerCount("debug") === 0) {
      return;
    }
    this.emit("debug", {
      action,
      interestName: interest?.name,
    });
  }

  /** Stop the protocol operation. */
  public close(): void {
    if (this.closed) {
      return;
    }
    this.closed = true;

    this.pBuffer.close();
    this.hProducer.close();
    this.sProducer.close();
  }

  public get(prefix: Name): SyncNode<Name> | undefined {
    return this.c.get(prefix);
  }

  public add(prefix: Name): SyncNode<Name> {
    return this.c.add(prefix);
  }

  private handleHelloInterest: ProducerHandler = async (interest) => {
    if (interest.name.length !== this.syncPrefix.length + 1) {
      // segment Interest should be satisfied by PSyncStateProducerBuffer
      return undefined;
    }

    const state = this.c.list(() => true);
    return this.sendStateData(interest, state, "h-process", this.hFreshness);
  };

  private handleSyncInterest: ProducerHandler = async (interest) => {
    if (interest.name.length !== this.syncPrefix.length + 1 + this.codec.encodeBloomLength + 1) {
      // segment Interest should be satisfied by PSyncStateProducerBuffer
      return undefined;
    }

    const nameHex = toHex(interest.name.value);
    if (this.sPendings.has(nameHex)) {
      // same as a pending Interest; if it could be answered, it would have been answered
      return undefined;
    }

    const ibltComp = interest.name.at(-1);
    const recvIblt = this.codec.comp2iblt(ibltComp);

    const { success, positive, total } = this.c.iblt.diff(recvIblt);
    if (!success) {
      // TODO publish ContentType=Nack via PSyncStateProducerBuffer
      const ibltComp = this.codec.iblt2comp(this.c.iblt);
      const name = interest.name.append(ibltComp, Segment.create(0));
      return new Data(name, Data.ContentType(0x03), Data.FreshnessPeriod(this.sFreshness), Data.FinalBlock);
    }

    const bloomComps = interest.name.slice(-1 - this.codec.encodeBloomLength, -1).comps;
    const bloom = await this.codec.decodeBloom(BloomFilter, bloomComps);
    const state = this.c.list(({ id: prefix, key }) => positive.has(key) &&
             bloom.contains(this.codec.toBloomKey(prefix)));
    if (total >= this.c.threshold || state.length > 0) {
      return this.sendStateData(interest, state, "s-reply", this.sFreshness);
    }

    this.debug("s-save", interest);
    const pending: PendingInterest = {
      interest,
      recvIblt,
      bloom,
      expire: setTimeout(() => {
        if (this.sPendings.delete(nameHex)) {
          this.debug("s-expire", pending.interest);
          pending.defer.resolve(undefined);
        }
        pending.bloom.dispose();
      }, interest.lifetime),
      defer: pDefer<Data | undefined>(),
    };
    this.sPendings.set(nameHex, pending);
    return pending.defer.promise;
  };

  private handleIncreaseSeqNum = (node: PSyncNode) => {
    this.debug(`+(${node.id},${node.seqNum})`);

    for (const [nameHex, { interest, recvIblt, bloom, expire, defer }] of this.sPendings) {
      const del = (data?: Promise<Data | undefined>) => {
        if (this.sPendings.delete(nameHex)) {
          clearTimeout(expire);
          defer.resolve(data);
        }
      };

      const { success, total } = this.c.iblt.diff(recvIblt);
      if (!success) {
        this.debug("s-drop", interest);
        del();
        continue;
      }

      const state: PSyncCore.State = [];
      let action: string;
      if (bloom.contains(this.codec.toBloomKey(node.id))) {
        action = "s-update";
        state.push(node);
      } else if (total >= this.c.threshold) {
        action = "s-ibf";
      } else {
        continue;
      }

      del(this.sendStateData(interest, state, action, this.sFreshness));
    }
  };

  private sendStateData(interest: Interest, state: PSyncCore.State, action: string, freshness: number): Promise<Data | undefined> {
    const ibltComp = this.codec.iblt2comp(this.c.iblt);
    const name = interest.name.append(ibltComp);

    this.debug(action, interest);
    const server = this.pBuffer.add(name, state, freshness);
    return server.processInterest(interest);
  }
}

export namespace PSyncPartialPublisher {
  export interface Parameters extends PSyncCore.Parameters, PSyncCodec.Parameters {
  }

  export interface Options {
    /**
     * Algorithm parameters.
     * They must match the subscriber parameters.
     */
    p: Parameters;

    /** Endpoint for communication. */
    endpoint?: Endpoint;

    /** Description for debugging purpose. */
    describe?: string;

    /** Sync producer prefix. */
    syncPrefix: Name;

    /**
     * FreshnessPeriod of hello reply Data packet.
     * @default 1000
     */
    helloReplyFreshness?: number;

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
  }
}
