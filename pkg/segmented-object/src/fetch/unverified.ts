import { CancelInterest, Forwarder, type FwFace, type FwPacket } from "@ndn/fw";
import { Data, Interest, type Name } from "@ndn/packet";
import { pushable } from "@ndn/util";
import itKeepAlive from "it-keepalive";
import take from "obliterator/take.js";

import { defaultSegmentConvention, type SegmentConvention } from "../convention";
import type { CongestionAvoidance } from "./congestion-avoidance";
import { RttEstimator } from "./rtt-estimator";
import { TcpCubic } from "./tcp-cubic";

export interface UnverifiedFetcherOptions {
  /**
   * Use the specified logical forwarder.
   * @defaultValue `Forwarder.getDefault()`
   */
  fw?: Forwarder;

  /**
   * FwFace description.
   * @defaultValue "fetch" + name
   */
  describe?: string;

  /** AbortSignal that allows canceling the fetch via AbortController. */
  signal?: AbortSignal;

  /**
   * Specify segment number range as `[begin, end)`.
   *
   * @remarks
   * The begin segment number is inclusive and the end segment number is exclusive.
   * If the begin segment number is greater than the final segment number, fetching will fail.
   * If the end segment number is undefined or greater than the final segment number,
   * fetching will stop at the final segment.
   */
  segmentRange?: [number, number | undefined];

  /**
   * Estimated final segment number (inclusive).
   *
   * @remarks
   * This option has no effect at the moment.
   * @alpha
   */
  estimatedFinalSegNum?: number;

  /**
   * Choose a segment number naming convention.
   * @defaultValue `Segment3`
   */
  segmentNumConvention?: SegmentConvention;

  /**
   * Modify Interest according to specified options.
   *
   * @remarks
   * This can also be used to witness Interests without modification.
   */
  modifyInterest?: Interest.Modify;

  /**
   * InterestLifetime added to RTO.
   * @defaultValue 1000ms
   */
  lifetimeAfterRto?: number;

  /** Use given RttEstimator instance or construct RttEstimator from options. */
  rtte?: RttEstimator | RttEstimator.Options;

  /** Use given congestion avoidance instance. */
  ca?: CongestionAvoidance;

  /**
   * Maximum number of retransmissions, excluding initial Interest.
   * @defaultValue 15
   */
  retxLimit?: number;

  /**
   * List of acceptable ContentType values.
   * @defaultValue `[0]`
   */
  acceptContentType?: readonly number[];
}

/** Segmented object fetcher without verification. */
export class UnverifiedFetcher {
  private readonly signal?: AbortSignal;
  /** Next segment number to start fetching. */
  private segNext: number;
  /** Last segment number (inclusive). */
  private segLast: number;
  private readonly segmentNumConvention: SegmentConvention;
  private readonly modifyInterest: Interest.ModifyFunc;
  private readonly lifetimeAfterRto: number;
  private readonly rtte: RttEstimator;
  private readonly ca: CongestionAvoidance;
  private readonly retxLimit: number;
  private readonly acceptContentType: readonly number[];

  private readonly face: FwFace;

  private count_ = 0;
  private nextCwndDecrease = 0;
  /** Segments for which at least one Interest is sent but the Data has not arrived. */
  private readonly pendings = new Map<number, SegState>();
  /** Segments whose RTO is exceeded and shall be retransmitted. */
  private readonly retxQ = new Set<number>();
  /** Interests being sent to logical forwarder. */
  private readonly txQ = pushable<FwPacket>();
  /** Data being received from logical forwarder. */
  private readonly rxQ = pushable<FwPacket>();

  constructor(
      private readonly name: Name,
      {
        fw = Forwarder.getDefault(),
        describe = `fetch(${name})`,
        signal,
        segmentRange: [segFirst, segLast1 = Number.MAX_SAFE_INTEGER] = [0, undefined],
        segmentNumConvention = defaultSegmentConvention,
        modifyInterest,
        lifetimeAfterRto = 1000,
        rtte,
        ca = new TcpCubic(),
        retxLimit = 15,
        acceptContentType = [0],
      }: UnverifiedFetcherOptions,
  ) {
    this.signal = signal;
    this.segNext = segFirst;
    this.segLast = segLast1 - 1;
    this.segmentNumConvention = segmentNumConvention;
    this.modifyInterest = Interest.makeModifyFunc(modifyInterest);
    this.lifetimeAfterRto = lifetimeAfterRto;
    this.rtte = rtte instanceof RttEstimator ? rtte : new RttEstimator(rtte);
    this.ca = ca;
    this.retxLimit = retxLimit;
    this.acceptContentType = acceptContentType;

    this.face = fw.addFace({
      rx: this.txQ,
      tx: async (iterable) => {
        for await (const data of iterable) {
          this.rxQ.push(data);
        }
        this.rxQ.stop();
      },
    }, { describe });
  }

  /** Number of segments retrieved so far. */
  public get count() { return this.count_; }

  /**
   * Retrieve segments without verification.
   * @returns Stream of segments.
   */
  public async *fetch(): AsyncIterable<SegData> {
    try {
      yield* this.unsafeFetch();
    } finally {
      this.txQ.stop();
      this.face.close();
    }
  }

  private async *unsafeFetch(): AsyncIterable<SegData> {
    for await (const pkt of itKeepAlive<FwPacket | false>(() => false, { timeout: 4 })(this.rxQ)) {
      if (this.signal?.aborted) {
        throw new Error("fetch aborted");
      }

      if (pkt) {
        const { l3, token, congestionMark = 0 } = pkt;
        if (l3 instanceof Data && typeof token === "number" && this.acceptContentType.includes(l3.contentType)) {
          yield* this.handleData(l3, token, congestionMark);
        }
      }

      this.processRtoExpiry();
      if (this.processTx()) {
        return;
      }
    }
    if (this.pendings.size > 0) {
      throw new Error("fetch incomplete");
    }
  }

  /**
   * Handle Data arrival.
   * @param data - Data packet.
   * @param seg - Segment number.
   * @param congestionMark - Congestion mark on Data packet; 0 if none.
   * @returns - Successfully retrieved segment, if any.
   */
  private *handleData(data: Data, seg: number, congestionMark: number): Iterable<SegData> {
    const fs = this.pendings.get(seg);
    if (!fs) {
      return;
    }

    const now = performance.now();
    const rtt = now - fs.txTime;
    if (fs.nRetx === 0) {
      this.rtte.push(rtt, this.pendings.size);
    }
    if (congestionMark) {
      this.decreaseCwnd(now);
    } else {
      this.ca.increase(now, rtt);
    }

    if (data.isFinalBlock) {
      this.segLast = seg;
    }
    ++this.count_;
    yield { data, seg };

    this.retxQ.delete(seg);
    this.pendings.delete(seg);
  }

  /** Process RTO expirations on pending segments. */
  private processRtoExpiry(): void {
    const now = performance.now();
    for (const [seg, fs] of this.pendings) {
      if (seg > this.segLast) {
        this.pendings.delete(seg);
        if (!this.retxQ.delete(seg)) {
          this.txQ.push(new CancelInterest(fs.interest!, seg));
        }
        continue;
      }

      if (!this.retxQ.has(seg) && fs.rtoExpiry < now) {
        if (fs.nRetx >= this.retxLimit) {
          throw new Error(`exceed retx limit on segment ${seg}`);
        }
        if (this.decreaseCwnd(fs.rtoExpiry)) {
          this.rtte.backoff();
        }
        this.retxQ.add(seg);
      }
    }
  }

  /**
   * Transmit Interests as needed.
   * @returns `true` if fetching is fully completed.
   */
  private processTx(): boolean {
    switch (true) {
      case this.pendings.size - this.retxQ.size >= this.ca.cwnd: {
        // congestion window full
        break;
      }
      case this.retxQ.size > 0: {
        const [seg] = take(this.retxQ, 1) as [number];
        this.retxQ.delete(seg);
        const fs = this.pendings.get(seg)!;
        ++fs.nRetx;
        this.sendInterest(fs);
        break;
      }
      case this.segNext <= this.segLast: {
        const seg = this.segNext++;
        const fs = new SegState(seg);
        this.pendings.set(seg, fs);
        this.sendInterest(fs);
        break;
      }
      case this.pendings.size === 0: {
        return true;
      }
    }
    return false;
  }

  /** Send an Interest and record TX time. */
  private sendInterest(fs: SegState): void {
    const rto = this.rtte.rto;
    fs.txTime = performance.now();
    fs.rtoExpiry = fs.txTime + rto;

    fs.interest = new Interest();
    fs.interest.name = this.name.append(this.segmentNumConvention, fs.seg);
    fs.interest.lifetime = rto + this.lifetimeAfterRto;
    this.modifyInterest(fs.interest);
    this.txQ.push({ l3: fs.interest, token: fs.seg });
  }

  /**
   * Decrease congestion window if allowed.
   * @param effAt - Effective time for the decreasing.
   * @returns Whether decreasing was allowed to happen.
   */
  private decreaseCwnd(effAt: number): boolean {
    if (effAt < this.nextCwndDecrease) {
      // react to one congestion event per RTO
      return false;
    }
    this.nextCwndDecrease = effAt + this.rtte.rto;
    this.ca.decrease(effAt);
    return true;
  }
}

export interface SegData {
  seg: number;
  data: Data;
}

/** Per-segment state. */
class SegState {
  constructor(public readonly seg: number) {}

  /** Last Interest TX time. */
  public txTime = 0;
  /** RTO expiration time for the last Interest. */
  public rtoExpiry = 0;
  /** Last Interest packet. */
  public interest?: Interest;
  /** Number of retransmissions. 0 means initial Interest. */
  public nRetx = 0;
}
