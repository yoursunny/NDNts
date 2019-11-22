import { LpService } from "@ndn/lp";
import { Data, Interest, LLSign, TT } from "@ndn/packet";
import { Decoder, Encoder, printTT, toHex } from "@ndn/tlv";
import { EventEmitter } from "events";
import { filter, map, pipeline } from "streaming-iterables";
import StrictEventEmitter from "strict-event-emitter-types";

import { Transport } from "./mod";

type Packet = Interest | Data;

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
  public readonly lp = new LpService();
  public readonly rx: AsyncIterable<Packet>;
  public get state() { return this.state_; }

  private transport: Transport;
  private state_: L3Face.State = L3Face.State.UP;

  constructor(transport: Transport, attributes: L3Face.Attributes = {}) {
    super();
    this.transport = transport;
    this.attributes = {
      advertiseFrom: false,
      ...transport.attributes,
      ...attributes,
    };
    this.rx = this.makeRx();
    (this.rx as any).return = undefined;
  }

  public async *makeRx() {
    const closePromise = new Promise((r) => this.once("close", r));
    while (this.state_ !== L3Face.State.CLOSED) {
      yield* pipeline(
        () => this.transport.rx,
        this.lp.rx,
        map(this.decode),
        filter((pkt): pkt is Packet => !!pkt),
      );
      await Promise.race([
        new Promise((r) => this.once("up", r)),
        closePromise,
      ]);
    }
  }

  private decode = ({ type, decoder, tlv }: Decoder.Tlv): Packet|undefined => {
    try {
      switch (type) {
        case TT.Interest:
          return decoder.decode(Interest);
        case TT.Data:
          return decoder.decode(Data);
        default:
          throw new Error(`TLV-TYPE ${printTT(type)} cannot appear at top level`);
      }
    } catch (err) {
      this.emit("rxerror", new L3Face.RxError(err, tlv));
    }
    return undefined;
  }

  public async tx(iterable: AsyncIterable<Packet>): Promise<void> {
    await this.txImpl(iterable);
    this.state_ = L3Face.State.CLOSED;
    this.emit("state", this.state_);
    this.emit("close");
  }

  private encode = async (packet: Packet): Promise<Uint8Array|undefined> => {
    try {
      await packet[LLSign.PROCESS]();
    } catch (err) {
      this.emit("txerror", new L3Face.TxError(err, packet));
      return undefined;
    }
    return Encoder.encode(packet);
  }

  private async txImpl(iterable: AsyncIterable<Packet>): Promise<void> {
    const iterator = iterable[Symbol.asyncIterator]();
    const transportTx = (async function*(this: L3Face) {
      while (true) {
        const { value, done } = await iterator.next();
        if (done) { return; }
        const wire = await this.encode(value as Packet);
        if (!wire) { continue; }
        yield wire;
      }
    }).bind(this);

    while (true) {
      try {
        await this.transport.tx(transportTx());
        return; // iterable drained, normal close
      } catch (err) { // TX error
        this.state_ = L3Face.State.DOWN;
        this.emit("state", this.state_);
        this.emit("down", err);
      }

      const reopenPromise = this.reopenTransport();
      while (true) {
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
      } catch (err) {
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

  export class RxError extends Error {
    constructor(inner: Error, public packet: Uint8Array) {
      super(`${inner.message} ${toHex(packet)}`);
    }
  }

  export class TxError extends Error {
    constructor(inner: Error, public packet: Packet) {
      super(`${inner.message} ${packet.name}`);
    }
  }
}
