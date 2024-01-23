import { assert, CustomEvent } from "@ndn/util";
import hirestime from "hirestime";
import DefaultWeakMap from "mnemonist/default-weak-map.js";
import pDefer from "p-defer";
import { pEvent } from "p-event";
import { TypedEventTarget } from "typescript-event-target";

import type { CongestionAvoidance } from "./congestion-avoidance";
import { RttEstimator } from "./rtt-estimator";
import { TcpCubic } from "./tcp-cubic";
import { TokenLimiter } from "./token-limiter";

const tokenLimiters = new DefaultWeakMap<CongestionAvoidance, TokenLimiter>((ca) => {
  const tl = new TokenLimiter();
  tl.capacity = ca.cwnd;
  ca.addEventListener("cwndupdate", () => { tl.capacity = ca.cwnd; });
  return tl;
});

class SegState {
  constructor(public readonly segNum: number) {}

  public get isRetx() { return this.nRetx > 0; }

  public nRetx = 0;
  public txTime = 0;
  public rto = 0;
  public rtoExpiry?: NodeJS.Timeout | number;
  public interest: any;
}

type SegRequest<T> = Pick<Readonly<SegState>, "segNum" | "isRetx" | "rto"> & {
  interest: T;
};

type EventMap = {
  /** Periodical unblock, for internal use. */
  unblock: Event;

  /** Fetching finished. */
  end: Event;

  /**
   * A segment request has exceeded maximum retx limit and will not be retried.
   * Event detail is the segment number.
   */
  exceedRetxLimit: CustomEvent<number>;
};

/** Congestion control logic. */
export class FetchLogic extends TypedEventTarget<EventMap> {
  /** Internal clock. */
  public readonly now: () => number = hirestime();

  private readonly rtte: RttEstimator;
  private readonly ca: CongestionAvoidance;
  private readonly tl: TokenLimiter;

  private readonly pending = new Map<number, SegState>();
  private readonly retxQueue = new Set<number>();
  private readonly retxLimit: number;

  private hiInterestSegNum: number;
  private hiDataSegNum = 0;
  private finalSegNum: number;
  private estimatedFinalSegNum: number;
  private cwndDecreaseSegNum = -1;

  private running = true;
  private processCancels = false;
  private paused?: Promise<void>;

  constructor({
    rtte,
    ca = new TcpCubic(),
    segmentRange = [0, undefined],
    estimatedFinalSegNum,
    retxLimit = 15,
  }: FetchLogic.Options) {
    super();
    this.rtte = rtte instanceof RttEstimator ? rtte : new RttEstimator(rtte);
    this.ca = ca;
    this.tl = tokenLimiters.get(this.ca);
    this.retxLimit = retxLimit;

    this.hiInterestSegNum = segmentRange[0] - 1;
    this.finalSegNum = Math.min(segmentRange[1] ?? Infinity, Number.MAX_SAFE_INTEGER) - 1;
    assert(this.hiInterestSegNum < this.finalSegNum, "invalid segmentRange");
    this.estimatedFinalSegNum = estimatedFinalSegNum ?? this.finalSegNum;
  }

  /** Abort. */
  public close() {
    this.running = false;
    this.dispatchTypedEvent("unblock", new Event("unblock"));
    for (const [, { rtoExpiry }] of this.pending) {
      clearTimeout(rtoExpiry);
    }
    this.tl.put(this.pending.size - this.retxQueue.size);
  }

  /**
   * Pause outgoing Interests, for backpressure from Data consumer.
   * Return a function for resuming.
   */
  public pause(): () => void {
    const defer = pDefer<void>();
    this.paused = defer.promise;
    return () => {
      defer.resolve();
      this.paused = undefined;
    };
  }

  /** Generate stream of outgoing requests. */
  public async *outgoing<T, C>(
      makeInterest: (req: SegRequest<unknown>) => T,
      cancelInterest: (req: SegRequest<T>) => C,
  ): AsyncGenerator<T | C> {
    while (this.running) {
      await this.paused;
      await this.tl.take();
      if (!this.running) {
        this.tl.put();
        break;
      }

      if (this.processCancels) {
        for (const [segNum, req] of this.pending) {
          if (segNum <= this.finalSegNum) { continue; }
          this.pending.delete(segNum);

          if (!this.retxQueue.delete(segNum)) {
            clearTimeout(req.rtoExpiry);
            this.tl.put();
            yield cancelInterest(req);
          }
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

      if (this.hiInterestSegNum < this.estimatedFinalSegNum) {
        const segNum = ++this.hiInterestSegNum;
        const req = new SegState(segNum);
        this.pending.set(segNum, req);

        yield this.prepareRequest(req, makeInterest);
        continue;
      }

      this.tl.put();
      if (this.pending.size === 0 && this.estimatedFinalSegNum >= this.finalSegNum) {
        this.dispatchTypedEvent("end", new Event("end"));
        break;
      }
      await pEvent(this, "unblock");
    }
  }

  private prepareRequest<T>(req: SegState, makeInterest: (req: SegRequest<unknown>) => T): T {
    req.txTime = this.now();
    req.rto = this.rtte.rto;
    req.rtoExpiry = setTimeout(() => this.rtoTimeout(req.segNum), req.rto);
    req.interest = makeInterest(req);
    return req.interest;
  }

  /**
   * Notify a request has been satisfied.
   * @param now reading of `this.now()` at packet arrival (e.g. before verification)
   */
  public satisfy(segNum: number, now: number, hasCongestionMark: boolean) {
    const req = this.pending.get(segNum);
    if (!req) {
      return;
    }
    this.pending.delete(segNum);
    if (!this.retxQueue.delete(segNum)) {
      clearTimeout(req.rtoExpiry);
      this.tl.put();
    }

    if (!req.isRetx) {
      const rtt = now - req.txTime;
      this.rtte.push(rtt, this.tl.nTaken + 1);
    }

    if (hasCongestionMark) {
      this.decrease(now, false);
    } else {
      this.ca.increase(now, this.rtte.sRtt);
    }

    this.hiDataSegNum = Math.max(this.hiDataSegNum, segNum);
    if (this.hiDataSegNum === this.estimatedFinalSegNum && this.estimatedFinalSegNum < this.finalSegNum) {
      ++this.estimatedFinalSegNum;
    }
    this.dispatchTypedEvent("unblock", new Event("unblock"));
  }

  private rtoTimeout(segNum: number) {
    const req = this.pending.get(segNum)!;
    assert(!!req);
    this.tl.put();

    if (segNum > this.finalSegNum) {
      return;
    }

    this.decrease(this.now(), true);

    if (req.nRetx >= this.retxLimit) {
      this.pending.delete(segNum);
      this.dispatchTypedEvent("exceedRetxLimit", new CustomEvent("exceedRetxLimit", { detail: segNum }));
    } else {
      this.retxQueue.add(segNum);
    }
    this.dispatchTypedEvent("unblock", new Event("unblock"));
  }

  /** Decrease congestion window at most once per RTT. */
  private decrease(now: number, backoff: boolean) {
    if (this.hiDataSegNum <= this.cwndDecreaseSegNum) {
      return;
    }
    this.ca.decrease(now);
    if (backoff) {
      this.rtte.backoff();
    }
    this.cwndDecreaseSegNum = this.hiInterestSegNum;
  }

  /**
   * Update final segment number (inclusive) when it becomes known.
   * Increasing this above opts.segmentRange[1] or a previous value has no effect.
   */
  public setFinalSegNum(finalSegNum: number, estimated = false) {
    if (finalSegNum >= this.finalSegNum) {
      return;
    }

    this.estimatedFinalSegNum = finalSegNum;
    if (!estimated) {
      this.finalSegNum = finalSegNum;
      this.processCancels = true;
    }
    this.dispatchTypedEvent("unblock", new Event("unblock"));
  }
}

export namespace FetchLogic {
  export interface Options {
    /** Use given RttEstimator instance or construct RttEstimator from options. */
    rtte?: RttEstimator | RttEstimator.Options;

    /** Use given congestion avoidance instance. */
    ca?: CongestionAvoidance;

    /**
     * Specify segment number range as [begin, end).
     * The begin segment number is inclusive and the end segment number is exclusive.
     * If the begin segment number is greater than the final segment number, fetching will fail.
     * If the end segment number is undefined or greater than the final segment number,
     * fetching will stop at the final segment.
     */
    segmentRange?: [number, number | undefined];

    /**
     * Estimated final segment number (inclusive).
     * If specified, FetchLogic sends Interests up to this segment number initially as permitted
     * by congestion control, then sends further Interests in a stop-and-wait manner, unless a new
     * estimation or known finalSegNum is provided via setFinalSegNum() function.
     */
    estimatedFinalSegNum?: number;

    /**
     * Maximum number of retransmissions, excluding initial Interest.
     * Default is 15.
     */
    retxLimit?: number;
  }
}
