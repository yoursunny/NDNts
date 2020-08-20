import { EventEmitter } from "events";
import hirestime from "hirestime";
import assert from "minimalistic-assert";
import DefaultWeakMap from "mnemonist/default-weak-map";
import TypedEmitter from "typed-emitter";

import { CongestionAvoidance } from "./congestion-avoidance";
import { RttEstimator } from "./rtt-estimator";
import { TcpCubic } from "./tcp-cubic";
import { TokenLimiter } from "./token-limiter";

const getNow = hirestime();

interface Options {
  /** Use given RttEstimator instance or construct RttEstimator from options. */
  rtte?: RttEstimator|RttEstimator.Options;

  /** Use given congestion avoidance instance. */
  ca?: CongestionAvoidance;

  /**
   * Specify segment number range as [begin, end).
   * The begin segment number is inclusive and the end segment number is exclusive.
   * If the begin segment number is greater than the final segment number, fetching will fail.
   * If the end segment number is undefined or greater than the final segment number,
   * fetching will stop at the final segment.
   */
  segmentRange?: [number, number|undefined];

  /**
   * Maximum number of retransmissions, excluding initial Interest.
   * Default is 15.
   */
  retxLimit?: number;
}

const tokenLimiters = new DefaultWeakMap<CongestionAvoidance, TokenLimiter>((ca) => {
  const tl = new TokenLimiter();
  tl.capacity = ca.cwnd;
  ca.on("cwndupdate", (cwnd) => tl.capacity = cwnd);
  return tl;
});

class SegState {
  constructor(public readonly segNum: number) {
  }

  public get isRetx() { return this.nRetx > 0; }

  public nRetx = 0;
  public txTime = 0;
  public rto = 0;
  public rtoExpiry?: NodeJS.Timeout;
  public interest: any;
}

type SegRequest<T> = Pick<Readonly<SegState>, "segNum"|"isRetx"|"rto"> & {
  interest: T;
};

const UNBLOCK = Symbol("UNBLOCK");

interface Events {
  [UNBLOCK]: () => void;

  /** Fetching finished. */
  end: () => void;

  /** A segment request has exceeded maximum retx limit and will not be retried. */
  exceedRetxLimit: (segNum: number) => void;
}

/** Congestion control logic. */
export class FetchLogic extends (EventEmitter as new() => TypedEmitter<Events>) {
  private readonly rtte: RttEstimator;
  private readonly ca: CongestionAvoidance;
  private readonly tl: TokenLimiter;

  private pending = new Map<number, SegState>();
  private retxQueue = new Set<number>();
  private readonly retxLimit: number;

  private hiInterestSegNum: number;
  private hiDataSegNum = 0;
  private finalSegNum: number;
  private cwndDecreaseSegNum = 0;

  private running = true;
  private processCancels = false;

  constructor(opts: Options) {
    super();
    this.rtte = opts.rtte instanceof RttEstimator ? opts.rtte : new RttEstimator(opts.rtte);
    this.ca = opts.ca ?? new TcpCubic();
    this.tl = tokenLimiters.get(this.ca);

    this.hiInterestSegNum = (opts.segmentRange?.[0] ?? 0) - 1;
    this.finalSegNum = (opts.segmentRange?.[1] ?? Number.MAX_SAFE_INTEGER) - 1;
    assert(this.hiInterestSegNum < this.finalSegNum, "invalid segmentRange");
    this.retxLimit = opts.retxLimit ?? 15;
  }

  /** Abort. */
  public close() {
    this.running = false;
    this.emit(UNBLOCK);
    for (const [, { rtoExpiry }] of this.pending) {
      clearTimeout(rtoExpiry!);
    }
    this.tl.put(this.pending.size - this.retxQueue.size);
  }

  /** Generate stream of outgoing requests. */
  public async *outgoing<T, C>(
      makeInterest: (req: SegRequest<unknown>) => T,
      cancelInterest: (req: SegRequest<T>) => C,
  ): AsyncGenerator<T|C> {
    while (this.running) {
      await this.tl.take();
      if (!this.running) { break; }

      if (this.processCancels) {
        for (const [segNum, req] of this.pending) {
          if (segNum <= this.finalSegNum) { continue; }
          if (!this.retxQueue.delete(segNum)) {
            clearTimeout(req.rtoExpiry!);
            this.tl.put();
            yield cancelInterest(req);
          }
          this.pending.delete(segNum);
        }
        this.processCancels = false;
      }

      if (this.retxQueue.size > 0) {
        let segNum!: number;
        // eslint-disable-next-line no-unreachable-loop
        for (segNum of this.retxQueue) {
          this.retxQueue.delete(segNum);
          break;
        }
        const req = this.pending.get(segNum)!;
        assert(!!req);
        ++req.nRetx;
        yield this.prepareRequest(req, makeInterest);
        continue;
      }

      if (this.hiInterestSegNum < this.finalSegNum) {
        const segNum = ++this.hiInterestSegNum;
        const req = new SegState(segNum);
        this.pending.set(segNum, req);
        yield this.prepareRequest(req, makeInterest);
        continue;
      }

      this.tl.put();
      if (this.pending.size === 0) {
        this.emit("end");
        break;
      }
      await new Promise((r) => this.once(UNBLOCK, r));
    }
  }

  private prepareRequest<T>(req: SegState, makeInterest: (req: SegRequest<unknown>) => T): T {
    req.txTime = getNow();
    req.rto = this.rtte.rto;
    req.rtoExpiry = setTimeout(() => this.rtoTimeout(req.segNum), req.rto);
    req.interest = makeInterest(req);
    return req.interest;
  }

  /** Notify a request has been satisfied. */
  public satisfy(segNum: number) {
    const req = this.pending.get(segNum);
    if (!req) { return; }
    if (!this.retxQueue.delete(segNum)) {
      clearTimeout(req.rtoExpiry!);
      this.tl.put();
    }
    this.pending.delete(segNum);

    const now = getNow();
    if (!req.isRetx) {
      const rtt = now - req.txTime;
      this.rtte.push(rtt, this.tl.nTaken + 1);
    }
    this.ca.increase(now, this.rtte.sRtt);
    this.hiDataSegNum = Math.max(this.hiDataSegNum, segNum);
    this.emit(UNBLOCK);
  }

  private rtoTimeout(segNum: number) {
    const req = this.pending.get(segNum)!;
    assert(!!req, `SegState ${segNum} is missing`);
    this.tl.put();

    if (segNum > this.finalSegNum) { return; }

    if (this.hiDataSegNum > this.cwndDecreaseSegNum) {
      this.ca.decrease(getNow());
      this.rtte.backoff();
      this.cwndDecreaseSegNum = this.hiInterestSegNum;
    }

    if (req.nRetx >= this.retxLimit) {
      this.pending.delete(segNum);
      this.emit("exceedRetxLimit", segNum);
    } else {
      this.retxQueue.add(segNum);
    }
    this.emit(UNBLOCK);
  }

  /** Update finalSegNum once it's known. */
  public setFinalSegNum(finalSegNum: number) {
    assert(finalSegNum <= this.finalSegNum, "cannot decrease finalSegNum");
    this.finalSegNum = finalSegNum;
    this.processCancels = true;
    this.emit(UNBLOCK);
  }
}

type Options_ = Options;
export namespace FetchLogic {
  export type Options = Options_;
}
