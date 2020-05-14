import { InterestToken } from "@ndn/fw";
import { LpService, NumericPitToken, PitToken } from "@ndn/lp";
import { Interest } from "@ndn/packet";
import { EventEmitter } from "events";
import { filter, pipeline, tap } from "streaming-iterables";
import StrictEventEmitter from "strict-event-emitter-types";

import { Transport } from "./mod";

type Packet = LpService.L3Pkt;

interface Events {
  /** Emitted upon face state change. */
  state: L3Face.State;
  /** Emitted upon state becomes UP. */
  up: void;
  /** Emitted upon state becomes DOWN. */
  down: Error;
  /** Emitted upon state becomes CLOSED. */
  close: void;
  /** Emitted upon RX decoding error. */
  rxerror: L3Face.RxError;
  /** Emitted upon TX preparation error. */
  txerror: L3Face.TxError;
}

type Emitter = StrictEventEmitter<EventEmitter, Events>;

const REOPENED = Symbol("L3Face.REOPENED");

/** Network layer face for sending and receiving L3 packets. */
export class L3Face extends (EventEmitter as new() => Emitter) {
  public readonly attributes: L3Face.Attributes;
  public readonly lp: LpService;
  public readonly numericPitToken = new NumericPitToken();
  public readonly rx: AsyncIterable<Packet>;
  public get state() { return this.state_; }

  private transport: Transport;
  private state_: L3Face.State = L3Face.State.UP;

  constructor(transport: Transport, attributes: L3Face.Attributes = {}, lpOptions: LpService.Options = {}) {
    super();
    this.transport = transport;
    this.attributes = {
      advertiseFrom: false,
      ...transport.attributes,
      ...attributes,
    };
    this.lp = new LpService(lpOptions);
    this.rx = this.makeRx();
    (this.rx as any).return = undefined;
  }

  private async *makeRx() {
    const closePromise = new Promise((r) => this.once("close", r));
    while (this.state_ !== L3Face.State.CLOSED) {
      yield* pipeline(
        () => this.transport.rx,
        this.lp.rx,
        filter((pkt): pkt is Packet => {
          if (pkt instanceof LpService.RxError) {
            this.emit("rxerror", pkt);
            return false;
          }
          return true;
        }),
        tap((pkt) => {
          if (pkt instanceof Interest) {
            InterestToken.set(pkt, PitToken.get(pkt));
          } else {
            InterestToken.set(pkt, this.numericPitToken.get(pkt));
          }
        }),
      );
      await Promise.race([
        new Promise((r) => this.once("up", r)),
        closePromise,
      ]);
    }
  }

  public tx = async (iterable: AsyncIterable<Packet>) => {
    await this.txImpl(iterable);
    this.state_ = L3Face.State.CLOSED;
    this.emit("state", this.state_);
    this.emit("close");
  };

  private async txImpl(iterable: AsyncIterable<Packet>): Promise<void> {
    const iterator = pipeline(
      () => iterable,
      tap((pkt) => {
        const token = InterestToken.get(pkt);
        if (typeof token === "number") {
          this.numericPitToken.set(pkt, token);
        } else if (token instanceof Uint8Array) {
          PitToken.set(pkt, token);
        }
      }),
      this.lp.tx,
    )[Symbol.asyncIterator]();

    const transportTx = (async function*(this: L3Face) {
      while (true) {
        const { value, done } = await iterator.next();
        if (done) { return; }
        if (value instanceof LpService.TxError) {
          this.emit("txerror", value);
        } else {
          yield value as Uint8Array;
        }
      }
    }).bind(this);

    for (;;) {
      try {
        await this.transport.tx(transportTx());
        return; // iterable drained, normal close
      } catch (err) { // TX error
        this.state_ = L3Face.State.DOWN;
        this.emit("state", this.state_);
        this.emit("down", err);
      }

      const reopenPromise = this.reopenTransport();
      for (;;) {
        const res = await Promise.race([
          reopenPromise, // wait for reopen completion
          iterator.next(), // drop packets
        ]);
        if (res === REOPENED) { break; } // reopened
        if (res.done) { return; } // normal close
      }
    }
  }

  private async reopenTransport(): Promise<typeof REOPENED> {
    for (let delay = 1; this.state_ === L3Face.State.DOWN; delay *= 2) {
      const randDelay = delay * (0.9 + Math.random() * 0.2);
      await new Promise((r) => setTimeout(r, randDelay));
      try {
        this.transport = await this.transport.reopen();
      } catch {
        // reopen error, try again
        continue;
      }
      this.state_ = L3Face.State.UP;
      this.emit("state", this.state_);
      this.emit("up");
    }
    // either reopened or closed
    return REOPENED;
  }

  public toString() {
    /* istanbul ignore next */
    return this.attributes.describe as string ?? `L3Face(${this.transport})`;
  }
}

export namespace L3Face {
  export enum State {
    UP,
    DOWN,
    CLOSED,
  }

  export interface Attributes extends Transport.Attributes {
    advertiseFrom?: boolean;
  }

  export type RxError = LpService.RxError;
  export type TxError = LpService.TxError;
}
