import { Forwarder, type FwFace, FwPacket } from "@ndn/fw";
import { Interest, Name, type NameLike, nullSigner, type Signer, type Verifier } from "@ndn/packet";
import { type SyncNode, type SyncProtocol, SyncUpdate } from "@ndn/sync-api";
import { Decoder, Encoder } from "@ndn/tlv";
import { assert, pushable, randomJitter, trackEventListener } from "@ndn/util";
import { consume, map, tap } from "streaming-iterables";
import type { Promisable } from "type-fest";
import { TypedEventTarget } from "typescript-event-target";

import { Version2 } from "./an";
import { StateVector } from "./state-vector";

interface DebugEntry {
  action: string;
  own: Record<string, number>;
  recv?: Record<string, number>;
  state: string;
  nextState?: string;
  ourOlder?: number;
  ourNewer?: number;
}

type EventMap = SyncProtocol.EventMap<Name> & {
  debug: CustomEvent<DebugEntry>;
  rxerror: CustomEvent<[interest: Interest, e: unknown]>;
};

/** StateVectorSync participant. */
export class SvSync extends TypedEventTarget<EventMap> implements SyncProtocol<Name> {
  public static async create({
    syncPrefix,
    fw = Forwarder.getDefault(),
    describe = `SvSync(${syncPrefix})`,
    initialStateVector = new StateVector(),
    initialize,
    syncInterestLifetime = 1000,
    periodicTimeout = [30000, 0.1],
    suppressionPeriod = 2200,
    suppressionTimeout = SvSync.suppressionExpDelay(suppressionPeriod),
    signer = nullSigner,
    verifier,
  }: SvSync.Options): Promise<SvSync> {
    if (typeof periodicTimeout === "number") {
      periodicTimeout = [periodicTimeout, 0.1];
    }

    const sync = new SvSync(
      syncPrefix,
      describe,
      initialStateVector,
      randomJitter(periodicTimeout[1], periodicTimeout[0]),
      suppressionTimeout,
      suppressionPeriod,
    );
    await initialize?.(sync);
    sync.makeFace(
      fw,
      syncInterestLifetime,
      signer,
      verifier,
    );
    return sync;
  }

  private constructor(
      public readonly syncPrefix: Name,
      public readonly describe: string,
      private readonly own: StateVector,
      private readonly steadyTimer: () => number,
      private readonly suppressionTimer: () => number,
      private readonly suppressionPeriod: number,
  ) {
    super();
    this.syncInterestName = syncPrefix.append(Version2);
  }

  private makeFace(
      fw: Forwarder,
      syncInterestLifetime: number,
      signer: Signer,
      verifier?: Verifier,
  ): void {
    this.face = fw.addFace({
      rx: map(async (interest) => {
        this.debug("send");
        interest.canBePrefix = true;
        interest.mustBeFresh = true;
        interest.lifetime = syncInterestLifetime;
        await signer.sign(interest);
        return FwPacket.create(interest);
      }, this.txStream),
      tx: (iterable) => consume(tap(async (pkt) => {
        if (!(FwPacket.isEncodable(pkt) && pkt.l3 instanceof Interest)) {
          return;
        }
        const interest = pkt.l3;
        try {
          await verifier?.verify(interest);
          await this.handleSyncInterest(interest);
        } catch (err: unknown) {
          this.dispatchTypedEvent("rxerror", new CustomEvent<[interest: Interest, e: unknown]>("rxerror", {
            detail: [interest, err],
          }));
        }
      }, iterable)),
    }, {
      describe: this.describe,
      routeCapture: false,
    });
    this.face.addRoute(this.syncInterestName, this.syncPrefix);
  }

  private readonly maybeHaveEventListener = trackEventListener(this);
  private face?: FwFace;
  private readonly syncInterestName: Name;
  private txStream = pushable<Interest>();

  /**
   * In steady state, undefined.
   * In suppression state, aggregated state vector of incoming sync Interests.
   */
  private aggregated?: StateVector;

  /** Sync Interest timer. */
  private timer!: NodeJS.Timeout | number;

  private debug(action: string, entry: Partial<DebugEntry> = {}, recv?: StateVector): void {
    if (!this.maybeHaveEventListener.debug) {
      return;
    }
    /* c8 ignore next */
    this.dispatchTypedEvent("debug", new CustomEvent<DebugEntry>("debug", {
      detail: {
        action,
        own: this.own.toJSON(),
        recv: recv?.toJSON(),
        state: this.aggregated ? "suppression" : "steady",
        ...entry,
      },
    }));
  }

  /** Cease operations. */
  public close(): void {
    clearTimeout(this.timer);
    this.face?.close();
  }

  public get(id: NameLike): SyncNode<Name> {
    return new SvSyncNode(Name.from(id), this.nodeOp);
  }

  public add(id: NameLike): SyncNode<Name> {
    return this.get(id);
  }

  /**
   * Obtain a copy of own state vector.
   *
   * @remarks
   * This may be used as {@link SvSync.Options.initialStateVector} to re-create an SvSync instance.
   */
  public get currentStateVector(): StateVector {
    return new StateVector(this.own);
  }

  /**
   * Multi-purpose callback passed to {@link SvSyncNode} constructor.
   *
   * @remarks
   * - `nodeOp(id)`: get seqNum
   * - `nodeOp(id, n)`: set seqNum, return new seqNum
   * - `nodeOp(id, 0)`: delete node during initialization
   */
  private readonly nodeOp = (id: Name, n: number | undefined): number => {
    if (n !== undefined) { // setSeqNum requested
      if (!this.face) { // decrement/remove permitted during initialization
        this.own.set(id, n);
      } else if (n > this.own.get(id)) { // increment only after initialization
        this.own.set(id, n);
        this.debug("publish");
        this.resetTimer(true);
      }
    }
    return this.own.get(id);
  };

  /**
   * Handle incoming sync Interest.
   * @param interest - Received Interest, signature verified.
   */
  private async handleSyncInterest(interest: Interest): Promise<void> {
    assert(interest.appParameters);
    const decoder = new Decoder(interest.appParameters);
    const recv = decoder.decode(StateVector);

    const ourOlder = this.own.listOlderThan(recv);
    const ourNewer = recv.listOlderThan(this.own);
    this.debug("recv", {
      nextState: (!this.aggregated && ourNewer.length > 0) ? "suppression" : undefined,
      ourOlder: ourOlder.length,
      ourNewer: ourNewer.length,
    }, recv);
    this.own.mergeFrom(recv);

    for (const { id, loSeqNum, hiSeqNum } of ourOlder) {
      this.dispatchTypedEvent("update", new SyncUpdate(this.get(id), loSeqNum, hiSeqNum));
    }

    if (this.aggregated) { // in suppression state
      this.aggregated.mergeFrom(recv);
      return undefined;
    }

    // in steady state
    if (this.shouldEnterSuppression(ourNewer)) {
      // entering suppression state
      this.aggregated = recv;
    }
    this.resetTimer();
    return undefined;
  }

  private shouldEnterSuppression(ourNewer: readonly StateVector.DiffEntry[]): boolean {
    const ignoreUpdatedAfter = Date.now() - this.suppressionPeriod;
    return ourNewer.some(({ id }) => this.own.getEntry(id).lastUpdate <= ignoreUpdatedAfter);
  }

  private resetTimer(immediate = false): void {
    clearTimeout(this.timer);
    const delay = immediate ? 0 : this.aggregated ? this.suppressionTimer() : this.steadyTimer();
    this.timer = setTimeout(this.handleTimer, delay);
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

  /** Transmit a sync Interest. */
  private sendSyncInterest(): void {
    const interest = new Interest();
    interest.name = this.syncInterestName;
    interest.appParameters = Encoder.encode(this.own);
    this.txStream.push(interest);
    // further modification and signing occur in the logical face
  }
}

export namespace SvSync {
  /** {@link SvSync.create} options. */
  export interface Options {
    /** Sync group prefix. */
    syncPrefix: Name;

    /**
     * Use the specified logical forwarder.
     * @defaultValue `Forwarder.getDefault()`
     */
    fw?: Forwarder;

    /** Description for debugging purpose. */
    describe?: string;

    /**
     * Initial state vector.
     * @defaultValue empty state vector
     */
    initialStateVector?: StateVector;

    /**
     * Application initialization function.
     *
     * @remarks
     * During initialization, it's possible to remove SyncNode or decrease seqNum.
     * Calling `sync.close()` has no effect.
     *
     * Sync protocol starts running after the returned Promise is resolved.
     */
    initialize?: (sync: SvSync) => Promisable<void>;

    /**
     * Sync Interest lifetime in milliseconds.
     * @defaultValue 1000
     */
    syncInterestLifetime?: number;

    /**
     * Sync Interest timer in steady state.
     * @defaultValue `[30000ms, ±10%]`
     * @remarks
     * If specified as tuple,
     * - median: median interval in milliseconds.
     * - jitter: ± percentage, in [0.0, 1.0) range.
     *
     * If specified as number, it's interpreted as median.
     */
    periodicTimeout?: number | [median: number, jitter: number];

    /**
     * Sync Interest timer in suppression state, maximum value.
     * @defaultValue `200ms`
     */
    suppressionPeriod?: number;

    /**
     * Sync Interest timer in suppression state, value generator.
     * @defaultValue `SvSync.suppressionExpDelay(suppressionPeriod)`
     * @remarks
     * The maximum value returned by the generator function should be `suppressionPeriod`.
     */
    suppressionTimeout?: () => number;

    /**
     * Sync Interest signer.
     * @defaultValue nullSigner
     */
    signer?: Signer;

    /**
     * Sync Interest verifier.
     * @defaultValue no verification
     */
    verifier?: Verifier;

    /** @deprecated This option has no effect and should be deleted. */
    svs2interest?: boolean;

    /** @deprecated This option has no effect and should be deleted. */
    svs2suppression?: boolean;
  }

  /**
   * SVS v2 suppression timeout exponential decay function.
   * @param c - Constant factor.
   * @param f - Decay factor.
   * @returns Function to generate suppression timeout values.
   * @experimental
   */
  export function suppressionExpDelay(c: number, f = 10): () => number {
    const cf = c / f;
    return () => {
      const v = Math.random() * c;
      return -c * Math.expm1((v - c) / cf);
    };
  }
}

class SvSyncNode implements SyncNode<Name> {
  constructor(
      public readonly id: Name,
      private readonly op: (id: Name, n: number | undefined) => number,
  ) {}

  public get seqNum(): number {
    return this.op(this.id, undefined);
  }

  public set seqNum(n: number) {
    this.op(this.id, n);
  }

  public remove(): void {
    this.op(this.id, 0);
  }
}
