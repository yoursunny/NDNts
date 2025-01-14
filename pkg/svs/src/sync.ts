import { Forwarder, type FwFace, FwPacket } from "@ndn/fw";
import { Data, Interest, Name, type NameLike, noopSigning, nullSigner, type Signer, TT as l3TT, type Verifier } from "@ndn/packet";
import { type SyncNode, type SyncProtocol, SyncUpdate } from "@ndn/sync-api";
import { Decoder, Encoder } from "@ndn/tlv";
import { assert, pushable, randomJitter, trackEventListener } from "@ndn/util";
import { consume, tap } from "streaming-iterables";
import type { Promisable } from "type-fest";
import { TypedEventTarget } from "typescript-event-target";

import { TT, Version2, Version3 } from "./an";
import { IDImpl, StateVector } from "./state-vector";

interface DebugEntry {
  action: string;
  own: Record<string, number>;
  recv?: Record<string, number>;
  state: string;
  nextState?: string;
  ourOlder?: number;
  ourNewer?: number;
}

type EventMap = SyncProtocol.EventMap<SvSync.ID> & {
  debug: CustomEvent<DebugEntry>;
  rxerror: CustomEvent<[interest: Interest, e: unknown]>;
};

/** StateVectorSync participant. */
export class SvSync extends TypedEventTarget<EventMap> implements SyncProtocol<SvSync.ID> {
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
    verifier = noopSigning,
    svs3 = false,
  }: SvSync.Options): Promise<SvSync> {
    if (typeof periodicTimeout === "number") {
      periodicTimeout = [periodicTimeout, 0.1];
    }

    const sync = new SvSync(
      svs3,
      syncPrefix,
      describe,
      initialStateVector,
      syncInterestLifetime,
      randomJitter(periodicTimeout[1], periodicTimeout[0]),
      suppressionTimeout,
      suppressionPeriod,
      signer,
      verifier,
    );
    await initialize?.(sync);
    sync.makeFace(fw);
    return sync;
  }

  private constructor(
      private readonly svs3: boolean,
      public readonly syncPrefix: Name,
      public readonly describe: string,
      private readonly own: StateVector,
      private readonly syncInterestLifetime: number,
      private readonly steadyTimer: () => number,
      private readonly suppressionTimer: () => number,
      private readonly suppressionPeriod: number,
      private readonly signer: Signer,
      private readonly verifier: Verifier,
  ) {
    super();
    this.syncInterestName = syncPrefix.append(svs3 ? Version3 : Version2);
  }

  private makeFace(fw: Forwarder): void {
    this.face = fw.addFace({
      rx: this.txStream,
      tx: (iterable) => consume(tap(async (pkt) => {
        if (!(FwPacket.isEncodable(pkt) && pkt.l3 instanceof Interest)) {
          return;
        }
        const interest = pkt.l3;
        try {
          const [recv] = await this.parseSyncInterest(interest);
          await this.handleRecv(recv);
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
  private txStream = pushable<FwPacket>();

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

  /**
   * Retrieve or create sync node by name.
   *
   * For SVS v2, retrieve or create sync node with specified name.
   *
   * For SVS v3, retrieve sync node with specified name and most recent bootstrap time.
   * If no sync node with this name exists, create sync node with current time as bootstrap time.
   */
  public get(name: NameLike): SyncNode<SvSync.ID>;

  /**
   * Retrieve or create sync node by name and bootstrap time (SVS v3).
   * @experimental
   */
  public get(id: { name: NameLike; boot: number }): SyncNode<SvSync.ID>;

  /**
   * Retrieve or create sync node by name and bootstrap time (SVS v3).
   * @experimental
   */
  public get(name: NameLike, boot: number): SyncNode<SvSync.ID>;

  public get(arg1: NameLike | { name: NameLike; boot: number }, boot = -1) {
    let id: IDImpl;
    if (arg1 instanceof IDImpl) {
      id = arg1;
    } else {
      let name: NameLike;
      if (Name.isNameLike(arg1)) {
        name = arg1;
      } else {
        ({ name, boot } = arg1);
      }
      name = Name.from(name);

      if (!this.svs3) {
        id = new IDImpl(name);
      } else if (boot === -1) {
        id = this.findByName(name) as IDImpl | undefined ?? new IDImpl(name, SvSync.makeBootstrapTime());
      } else {
        id = new IDImpl(name, boot);
      }
    }
    return new SvSyncNode(id, this.nodeOp);
  }

  /**
   * Retrieve or create sync node by name.
   *
   * For SVS v2, same as `get(name)`.
   *
   * For SVS v3, create sync node with specified name and current bootstrap time.
   * Note the different between `get(name)` and `add(name)`:
   * - `get(name)` searches for existing sync nodes with specified name first.
   * - `add(name)` almost always creates a new sync node.
   */
  public add(name: NameLike): SyncNode<SvSync.ID>;

  /**
   * Same as `get(id)` (SVS v3).
   * @experimental
   */
  public add(id: { name: NameLike; boot: number }): SyncNode<SvSync.ID>;

  /**
   * Same as `get(name, boot)` (SVS v3).
   * @experimental
   */
  public add(name: NameLike, boot: number): SyncNode<SvSync.ID>;

  public add(arg1: any, boot = SvSync.makeBootstrapTime()): SyncNode<SvSync.ID> {
    return this.get(arg1, boot);
  }

  private findByName(name: Name): StateVector.ID | undefined {
    let best: StateVector.ID | undefined;
    for (const [id] of this.own) {
      if (!id.name.equals(name)) {
        continue;
      }
      if (!best || id.boot > best.boot) {
        best = id;
      }
    }
    return best;
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
   * Parse and verify incoming sync Interest.
   * @param interest - Received Interest.
   */
  private async parseSyncInterest(interest: Interest): Promise<[recv: StateVector, piggyback: Uint8Array]> {
    assert(interest.appParameters);
    const d0 = new Decoder(interest.appParameters);
    const { type, decoder: d1, after } = d0.read();
    let recv: StateVector;
    switch (type) {
      case TT.StateVector: { // SVS v2
        await this.verifier.verify(interest);
        recv = d1.decode(StateVector);
        break;
      }
      case l3TT.Data: { // SVS v3
        const data = d1.decode(Data);
        assert(data.name.equals(this.syncInterestName));
        await this.verifier.verify(data);
        recv = Decoder.decode(data.content, StateVector);
        break;
      }
      default: {
        throw new Error("cannot find StateVector in Interest");
      }
    }
    return [recv, after];
  }

  /**
   * Handle incoming state vector.
   * @param recv - Received StateVector.
   */
  private async handleRecv(recv: StateVector): Promise<void> {
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
        void this.sendSyncInterest();
      }
      this.aggregated = undefined;
    } else { // in steady state
      this.debug("timer");
      void this.sendSyncInterest();
    }

    this.resetTimer();
  };

  /** Transmit a sync Interest. */
  private async sendSyncInterest(): Promise<void> {
    const interest = new Interest();
    interest.name = this.syncInterestName;
    interest.canBePrefix = true;
    interest.mustBeFresh = true;
    interest.lifetime = this.syncInterestLifetime;

    if (this.svs3) {
      const encoder = new Encoder();
      this.own.encodeTo(encoder, 3);

      const data = new Data();
      data.name = this.syncInterestName;
      data.content = encoder.output;
      await this.signer.sign(data);

      interest.appParameters = Encoder.encode(data);
      await interest.updateParamsDigest();
    } else {
      interest.appParameters = Encoder.encode(this.own);
      await this.signer.sign(interest);
    }

    this.debug("send");
    this.txStream.push(FwPacket.create(interest));
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
     * Sync Interest signer (SVS v2).
     * State Vector Data signer (SVS v3).
     * @defaultValue nullSigner
     */
    signer?: Signer;

    /**
     * Sync Interest verifier (SVS v2).
     * State Vector Data verifier (SVS v3).
     * @defaultValue no verification
     */
    verifier?: Verifier;

    /** @deprecated This option has no effect and should be deleted. */
    svs2interest?: boolean;

    /** @deprecated This option has no effect and should be deleted. */
    svs2suppression?: boolean;

    /**
     * Enable SVS v3 experimental features.
     * @defaultValue false
     * @experimental
     */
    svs3?: boolean;
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

  /**
   * Make SVS v3 bootstrap time based on current timestamp.
   * @experimental
   */
  export function makeBootstrapTime(now = Date.now()): number {
    return Math.trunc(now / 1000);
  }

  /**
   * Sync node ID.
   *
   * For SVS v2, this should be accessed as `Name`.
   * Accessing the object fields would give [name, -1].
   *
   * For SVS v3, this should be access as `{ name, boot }` object.
   * Accessing as `Name` would return the name only.
   *
   * Note: the `Name` variant will be deleted when SVS v2 support is dropped.
   */
  export type ID = Name & StateVector.ID;
}

class SvSyncNode implements SyncNode<SvSync.ID> {
  constructor(
      public readonly id: SvSync.ID,
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
