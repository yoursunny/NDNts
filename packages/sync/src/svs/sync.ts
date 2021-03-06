import { Endpoint, Producer, ProducerHandler } from "@ndn/endpoint";
import { Interest, Name, nullSigner, Signer, Verifier } from "@ndn/packet";
import { fromUtf8, toHex, toUtf8 } from "@ndn/tlv";
import { EventEmitter } from "events";
import type TypedEmitter from "typed-emitter";

import { SyncNode, SyncProtocol, SyncUpdate } from "../types";
import { SvVersionVector } from "./version-vector";

interface DebugEntry {
  action: string;
  own: Record<string, number>;
  recv?: Record<string, number>;
  state: string;
  nextState?: string;
  ourOlder?: number;
  ourNewer?: number;
}

interface Events extends SyncProtocol.Events<SvSync.ID> {
  debug: (entry: DebugEntry) => void;
}

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

  /** Own version vector. */
  private readonly own = new SvVersionVector();

  /**
   * In steady state, undefined.
   * In suppression state, aggregated version vector of incoming sync Interests.
   */
  private aggregated?: SvVersionVector;

  /** Sync Interest timer. */
  private timer!: NodeJS.Timeout;

  private debug(action: string, entry: Partial<DebugEntry> = {}, recv?: SvVersionVector): void {
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

  private makeNode(...args: ConstructorParameters<typeof SvSync.ID>): SyncNode<SvSync.ID> {
    const id = new SvSync.ID(...args);
    return new SvSyncNode(id, this.own, this.handlePublish);
  }

  private readonly handlePublish = () => {
    this.debug("publish");
    this.resetTimer(true);
  };

  private readonly handleSyncInterest: ProducerHandler = async (interest) => {
    await this.verifier?.verify(interest);
    const recv = SvVersionVector.fromComponent(interest.name.at(this.syncPrefix.length));

    const ourOlder = this.own.listOlderThan(recv);
    const ourNewer = recv.listOlderThan(this.own);
    this.debug("recv", {
      nextState: (!this.aggregated && ourNewer.length > 0) ? "suppression" : undefined,
      ourOlder: ourOlder.length,
      ourNewer: ourNewer.length,
    }, recv);
    this.own.mergeFrom(recv);

    for (const { node, hex, loSeqNum, hiSeqNum } of ourOlder) {
      this.emit("update", new SyncUpdate(this.makeNode(node, hex), loSeqNum, hiSeqNum));
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
      timeout = Math.floor(ms - maxJitter + Math.random() * 2 * maxJitter);
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

  export type IDLike = string | Uint8Array | ID;

  export class ID {
    constructor(input: IDLike, hex?: string) {
      this.value = typeof input === "string" ? toUtf8(input) :
        ArrayBuffer.isView(input) ? input : input.value;
      this.hex = hex ?? toHex(this.value);
    }

    public readonly value: Uint8Array;
    public readonly hex: string;

    public get text(): string {
      return fromUtf8(this.value);
    }
  }
}

class SvSyncNode implements SyncNode<SvSync.ID> {
  constructor(
      public readonly id: SvSync.ID,
      private readonly own: SvVersionVector,
      private readonly handlePublish: () => void,
  ) {}

  public get seqNum(): number {
    return this.own.get(this.id.hex) ?? 0;
  }

  public set seqNum(n: number) {
    if (n <= this.seqNum) {
      return;
    }

    this.own.set(this.id.hex, this.id.value, n);
    this.handlePublish();
  }

  public remove(): void {
    // no effect
  }
}
