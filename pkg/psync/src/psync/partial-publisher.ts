import { type Endpoint, produce, type Producer, type ProducerHandler, type ProducerOptions } from "@ndn/endpoint";
import { Segment } from "@ndn/naming-convention2";
import { Data, type Interest, type Name, NameMap, type Signer } from "@ndn/packet";
import type { SyncNode, SyncProtocol } from "@ndn/sync-api";
import { trackEventListener } from "@ndn/util";
import { BloomFilter } from "@yoursunny/psync-bloom";
import pDefer, { type DeferredPromise } from "p-defer";
import { TypedEventTarget } from "typescript-event-target";

import type { IBLT } from "../iblt";
import { PSyncCodec } from "./codec";
import { PSyncCore, type PSyncNode } from "./core";
import { StateProducerBuffer } from "./state-producer-buffer";

interface PendingInterest {
  interest: Interest;
  recvIblt: IBLT;
  bloom: BloomFilter;
  expire: NodeJS.Timeout | number;
  defer: DeferredPromise<Data | undefined>;
}

interface DebugEntry {
  action: string;
  interestName?: Name;
}

type EventMap = SyncProtocol.EventMap<Name> & {
  debug: CustomEvent<DebugEntry>;
};

/** PSync - PartialSync publisher. */
export class PartialPublisher extends TypedEventTarget<EventMap> implements SyncProtocol<Name> {
  constructor({
    p,
    syncPrefix,
    describe = `PartialPublisher(${syncPrefix})`,
    endpoint, // eslint-disable-line etc/no-deprecated
    pOpts,
    helloReplyFreshness = 1000,
    syncReplyFreshness = 1000,
    signer,
    producerBufferLimit = 32,
  }: PartialPublisher.Options) {
    super();
    this.describe = describe;
    this.syncPrefix = syncPrefix;
    this.c = new PSyncCore(p);
    this.c.onIncreaseSeqNum = this.handleIncreaseSeqNum;
    this.codec = new PSyncCodec(p, this.c.ibltParams);

    this.pBuffer = new StateProducerBuffer(this.describe, this.codec, producerBufferLimit, {
      ...endpoint?.pOpts,
      ...pOpts,
      dataSigner: signer,
    });
    this.hFreshness = helloReplyFreshness;
    this.hProducer = produce(syncPrefix.append("hello"), this.handleHelloInterest, {
      ...endpoint?.pOpts,
      ...pOpts,
      describe: `${this.describe}[h]`,
      concurrency: Infinity,
      announcement: syncPrefix,
    });
    this.sFreshness = syncReplyFreshness;
    this.sProducer = produce(syncPrefix.append("sync"), this.handleSyncInterest, {
      ...endpoint?.pOpts,
      ...pOpts,
      describe: `${this.describe}[s]`,
      concurrency: Infinity,
      announcement: syncPrefix,
    });
  }

  private readonly maybeHaveEventListener = trackEventListener(this);
  public readonly describe: string;
  private readonly syncPrefix: Name;
  private readonly c: PSyncCore;
  private readonly codec: PSyncCodec;
  private closed = false;

  private readonly pBuffer: StateProducerBuffer;
  private readonly hFreshness: number;
  private readonly hProducer: Producer;
  private readonly sFreshness: number;
  private readonly sProducer: Producer;
  private readonly sPendings = new NameMap<PendingInterest>();

  private debug(action: string, interest?: Interest): void {
    if (!this.maybeHaveEventListener.debug) {
      return;
    }
    /* c8 ignore next */
    this.dispatchTypedEvent("debug", new CustomEvent<DebugEntry>("debug", {
      detail: {
        action,
        interestName: interest?.name,
      },
    }));
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

  private readonly handleHelloInterest: ProducerHandler = async (interest) => {
    if (interest.name.length !== this.syncPrefix.length + 1) {
      // segment Interest should be satisfied by StateProducerBuffer
      return undefined;
    }

    const state = this.c.list(() => true);
    return this.sendStateData(interest, state, "h-process", this.hFreshness);
  };

  private readonly handleSyncInterest: ProducerHandler = async (interest) => {
    if (interest.name.length !== this.syncPrefix.length + 1 + this.codec.encodeBloomLength + 1) {
      // segment Interest should be satisfied by StateProducerBuffer
      return undefined;
    }

    if (this.sPendings.has(interest.name)) {
      // same as a pending Interest; if it could be answered, it would have been answered
      return undefined;
    }

    const ibltComp = interest.name.at(-1);
    const recvIblt = this.codec.comp2iblt(ibltComp);

    const { success, positive, total } = this.c.iblt.diff(recvIblt);
    if (!success) {
      // TODO publish ContentType=Nack via StateProducerBuffer
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
        if (this.sPendings.delete(interest.name)) {
          this.debug("s-expire", pending.interest);
          pending.defer.resolve(undefined);
        }
      }, interest.lifetime),
      defer: pDefer<Data | undefined>(),
    };
    this.sPendings.set(interest.name, pending);
    return pending.defer.promise;
  };

  private readonly handleIncreaseSeqNum = (node: PSyncNode) => {
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

export namespace PartialPublisher {
  /** Algorithm parameters. */
  export interface Parameters extends PSyncCore.Parameters, PSyncCodec.Parameters {
  }

  /** {@link PartialPublisher} constructor options. */
  export interface Options {
    /**
     * Algorithm parameters.
     *
     * @remarks
     * They must match the subscriber parameters.
     */
    p: Parameters;

    /** Sync producer prefix. */
    syncPrefix: Name;

    /**
     * Description for debugging purpose.
     * @defaultValue PartialPublisher + syncPrefix
     */
    describe?: string;

    /**
     * Endpoint for communication.
     * @deprecated Specify `.pOpts`.
     */
    endpoint?: Endpoint;

    /**
     * Producer options (advanced).
     *
     * @remarks
     * - `.fw` is overridden as {@link Options.fw}.
     * - `.describe` is overridden as {@link Options.describe}.
     * - `.announcement` is overridden.
     * - `.routeCapture` is overridden.
     * - `.concurrency` is overridden.
     */
    pOpts?: ProducerOptions;

    /**
     * FreshnessPeriod of hello reply Data packet.
     * @defaultValue 1000
     */
    helloReplyFreshness?: number;

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
  }
}
