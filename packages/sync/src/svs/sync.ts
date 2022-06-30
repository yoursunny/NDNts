import { type Producer, type ProducerHandler, Endpoint } from "@ndn/endpoint";
import { type NameLike, type Signer, type Verifier, Interest, Name, nullSigner } from "@ndn/packet";
import { EventEmitter } from "node:events";
import type TypedEmitter from "typed-emitter";

import { type SyncNode, type SyncProtocol, SyncUpdate } from "../types";
import { SvStateVector } from "./state-vector";

interface DebugEntry {
  action: string;
  own: Record<string, number>;
  recv?: Record<string, number>;
  state: string;
  nextState?: string;
  ourOlder?: number;
  ourNewer?: number;
}

type Events = SyncProtocol.Events<SvSync.ID> & {
  debug: (entry: DebugEntry) => void;
};

/** StateVectorSync participant. */
export class SvSync extends (EventEmitter as new() => TypedEmitter<Events>)
  implements SyncProtocol<SvSync.ID> {
  constructor({
    endpoint = new Endpoint(),
    describe,
    syncPrefix,
    syncInterestLifetime = 1000,
    steadyTimer = [30000, 0.1],
    suppressionTimer = [200, 0.5],
    signer = nullSigner,
    verifier,
  }: SvSync.Options) {
    super();
    this.endpoint = endpoint;
    this.describe = describe ?? `SvSync(${syncPrefix})`;
    this.syncPrefix = syncPrefix;
    this.syncInterestLifetime = syncInterestLifetime;
    this.steadyTimer = steadyTimer;
    this.suppressionTimer = suppressionTimer;
    this.signer = signer;
    this.verifier = verifier;

    this.producer = this.endpoint.produce(this.syncPrefix, this.handleSyncInterest, {
      describe: `${this.describe}[p]`,
      routeCapture: false,
    });
  }

  private readonly endpoint: Endpoint;
  public readonly describe: string;
  private readonly syncPrefix: Name;
  private readonly syncInterestLifetime: number;
  private readonly steadyTimer: SvSync.Timer;
  private readonly suppressionTimer: SvSync.Timer;
  private readonly signer: Signer;
  private readonly verifier?: Verifier;

  private readonly producer: Producer;

  /** Own state vector. */
  private readonly own = new SvStateVector();

  /**
   * In steady state, undefined.
   * In suppression state, aggregated state vector of incoming sync Interests.
   */
  private aggregated?: SvStateVector;

  /** Sync Interest timer. */
  private timer!: NodeJS.Timeout | number;

  private debug(action: string, entry: Partial<DebugEntry> = {}, recv?: SvStateVector): void {
    if (this.listenerCount("debug") > 0) {
      this.emit("debug", {
        action,
        own: this.own.toJSON(),
        recv: recv?.toJSON(),
        state: this.aggregated ? "suppression" : "steady",
        ...entry,
      });
    }
  }

  public close(): void {
    clearTimeout(this.timer);
    this.producer.close();
  }

  public get(id: SvSync.IDLike): SyncNode<SvSync.ID> {
    return this.makeNode(id);
  }

  public add(id: SvSync.IDLike): SyncNode<SvSync.ID> {
    return this.makeNode(id);
  }

  private makeNode(id: SvSync.IDLike): SyncNode<SvSync.ID> {
    return new SvSyncNode(new SvSync.ID(id), this.own, this.handlePublish);
  }

  private readonly handlePublish = () => {
    this.debug("publish");
    this.resetTimer(true);
  };

  private readonly handleSyncInterest: ProducerHandler = async (interest) => {
    await this.verifier?.verify(interest);
    const recv = SvStateVector.fromComponent(interest.name.at(this.syncPrefix.length));

    const ourOlder = this.own.listOlderThan(recv);
    const ourNewer = recv.listOlderThan(this.own);
    this.debug("recv", {
      nextState: (!this.aggregated && ourNewer.length > 0) ? "suppression" : undefined,
      ourOlder: ourOlder.length,
      ourNewer: ourNewer.length,
    }, recv);
    this.own.mergeFrom(recv);

    for (const { id, loSeqNum, hiSeqNum } of ourOlder) {
      this.emit("update", new SyncUpdate(this.makeNode(id), loSeqNum, hiSeqNum));
    }

    if (this.aggregated) { // in suppression state
      this.aggregated.mergeFrom(recv);
    } else if (ourNewer.length > 0) { // in steady state, entering suppression state
      this.aggregated = recv;
      this.resetTimer();
    } else { // in steady state
      this.resetTimer();
    }
    return undefined;
  };

  private resetTimer(immediate = false): void {
    clearTimeout(this.timer);
    let timeout = 0;
    if (!immediate) {
      const [ms, jitter] = this.aggregated ? this.suppressionTimer : this.steadyTimer;
      const maxJitter = ms * Math.max(0, Math.min(jitter, 1));
      timeout = Math.trunc(ms - maxJitter + Math.random() * 2 * maxJitter);
    }
    this.timer = setTimeout(this.handleTimer, timeout);
  }

  private readonly handleTimer = () => {
    if (this.aggregated) { // in suppression state, exiting to steady state
      const ourNewer = this.aggregated.listOlderThan(this.own);
      this.debug("timer", {
        nextState: "steady",
        ourNewer: ourNewer.length,
      });
      if (ourNewer.length > 0) {
        this.sendSyncInterest();
      }
      this.aggregated = undefined;
    } else { // in steady state
      this.debug("timer");
      this.sendSyncInterest();
    }

    this.resetTimer();
  };

  private sendSyncInterest(): void {
    this.debug("send");

    const interest = new Interest();
    interest.name = this.syncPrefix.append(this.own.toComponent());
    interest.canBePrefix = true;
    interest.mustBeFresh = true;
    interest.lifetime = this.syncInterestLifetime;

    void (async () => {
      await this.signer.sign(interest);
      try {
        await this.endpoint.consume(interest, {
          describe: `${this.describe}[c]`,
        });
      } catch {}
    })();
  }
}

export namespace SvSync {
  /**
   * Timer settings.
   * ms: median interval in milliseconds.
   * jitter: ± percentage, in [0.0, 1.0) range.
   */
  export type Timer = [ms: number, jitter: number];

  export interface Options {
    /** Endpoint for communication. */
    endpoint?: Endpoint;

    /** Description for debugging purpose. */
    describe?: string;

    /** Sync group prefix. */
    syncPrefix: Name;

    /**
     * Sync Interest lifetime in milliseconds.
     * @default 1000
     */
    syncInterestLifetime?: number;

    /**
     * Sync Interest timer in steady state.
     * Default is [30000ms, ±10%]
     */
    steadyTimer?: Timer;

    /**
     * Sync Interest timer in suppression state.
     * Default is [200ms, ±50%]
     */
    suppressionTimer?: Timer;

    /**
     * Sync Interest signer.
     * Default is NullSigning.
     */
    signer?: Signer;

    /**
     * Sync Interest verifier.
     * Default is no verification.
     */
    verifier?: Verifier;
  }

  export type IDLike = ID | NameLike;

  export class ID {
    constructor(input: IDLike) {
      this.name = input instanceof ID ? input.name : Name.from(input);
    }

    public readonly name: Name;

    public get text(): string {
      return this.name.toString();
    }
  }

  export interface Node extends SyncNode<ID> {}
}

class SvSyncNode implements SvSync.Node {
  constructor(
      public readonly id: SvSync.ID,
      private readonly own: SvStateVector,
      private readonly handlePublish: () => void,
  ) {}

  public get seqNum(): number {
    return this.own.get(this.id.name);
  }

  public set seqNum(n: number) {
    if (n <= this.seqNum) {
      return;
    }

    this.own.set(this.id.name, n);
    this.handlePublish();
  }

  public remove(): void {
    // no effect
  }
}
