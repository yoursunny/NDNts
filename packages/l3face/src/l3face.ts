import { Forwarder, FwFace, FwPacket } from "@ndn/fw";
import { LpService, NumericPitToken } from "@ndn/lp";
import { Interest } from "@ndn/packet";
import { EventEmitter } from "events";
import { filter, map, pipeline } from "streaming-iterables";
import type TypedEmitter from "typed-emitter";

import type { Transport } from "./mod";

interface Events {
  /** Emitted upon face state change. */
  state: (state: L3Face.State) => void;
  /** Emitted upon state becomes UP. */
  up: () => void;
  /** Emitted upon state becomes DOWN. */
  down: (err: Error) => void;
  /** Emitted upon state becomes CLOSED. */
  close: () => void;
  /** Emitted upon RX decoding error. */
  rxerror: (err: L3Face.RxError) => void;
  /** Emitted upon TX preparation error. */
  txerror: (err: L3Face.TxError) => void;
}

const REOPENED = Symbol("L3Face.REOPENED");

/** Network layer face for sending and receiving L3 packets. */
export class L3Face extends (EventEmitter as new() => TypedEmitter<Events>) implements FwFace.RxTx {
  public readonly attributes: L3Face.Attributes;
  public readonly lp: LpService;
  public readonly numericPitToken = new NumericPitToken();
  public readonly rx: AsyncIterable<FwPacket>;
  public get state() { return this.state_; }

  private state_: L3Face.State = L3Face.State.UP;

  constructor(
      private transport: Transport,
      attributes: L3Face.Attributes = {},
      lpOptions: LpService.Options = {},
  ) {
    super();
    this.attributes = {
      describe: `L3Face(${transport})`,
      advertiseFrom: false,
      ...transport.attributes,
      ...attributes,
    };
    this.lp = new LpService(lpOptions);
    this.rx = this.makeRx();
    (this.rx as any).return = undefined;
  }

  private async *makeRx() {
    const closePromise = new Promise<void>((r) => this.once("close", r));
    while (this.state_ !== L3Face.State.CLOSED) {
      yield* pipeline(
        () => this.transport.rx,
        this.lp.rx,
        filter((pkt): pkt is LpService.Packet => {
          if (pkt instanceof LpService.RxError) {
            this.emit("rxerror", pkt);
            return false;
          }
          return true;
        }),
        map(({ l3, token }: LpService.Packet) => {
          let internalToken: Uint8Array|number|undefined;
          if (l3 instanceof Interest) {
            internalToken = token;
          } else {
            internalToken = this.numericPitToken.toNumber(token);
          }
          return FwPacket.create(l3, internalToken);
        }),
      );
      await Promise.race([
        new Promise<void>((r) => this.once("up", r)),
        closePromise,
      ]);
    }
  }

  public tx = async (iterable: AsyncIterable<FwPacket>) => {
    await this.txImpl(iterable);
    this.state_ = L3Face.State.CLOSED;
    this.emit("state", this.state_);
    this.emit("close");
  };

  private async txImpl(iterable: AsyncIterable<FwPacket>): Promise<void> {
    const iterator = pipeline(
      () => iterable,
      filter((pkt: FwPacket) => FwPacket.isEncodable(pkt)),
      map(({ l3, token }: FwPacket) => {
        let wireToken: Uint8Array|undefined;
        if (typeof token === "number") {
          wireToken = this.numericPitToken.toToken(token);
        } else if (token instanceof Uint8Array) {
          wireToken = token;
        }
        return { l3, token: wireToken };
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
      } catch (err: unknown) { // TX error
        this.state_ = L3Face.State.DOWN;
        this.emit("state", this.state_);
        this.emit("down", err as Error);
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

  export interface CreateFaceOptions {
    fw?: Forwarder;
    l3?: Attributes;
    lp?: LpService.Options;
  }

  /**
   * A function to create a transport then add to forwarder.
   * First parameter is CreateFaceOptions.
   * Subsequent parameters are passed to Transport.connect() function.
   * Returns FwFace.
   */
  export type CreateFaceFunc<
    P extends any[],
    R extends Transport|Transport[],
  > = (opts: CreateFaceOptions, ...args: P) => Promise<R extends Transport[] ? FwFace[] : FwFace>;

  export function makeCreateFace<
    C extends (...args: any[]) => Promise<Transport|Transport[]>,
    P extends any[] = C extends (...args: infer P) => any ? P : never,
    R extends Transport|Transport[] = C extends (...args: any[]) => Promise<infer R> ? R : never,
  >(createTransport: C): CreateFaceFunc<P, R> {
    return (async (opts: CreateFaceOptions, ...args: P) => {
      const created = await createTransport(...args);
      const {
        fw = Forwarder.getDefault(),
        l3,
        lp,
      } = opts;
      const makeFace = (transport: Transport) => fw.addFace(new L3Face(transport, l3, lp));
      return Array.isArray(created) ? created.map(makeFace) : makeFace(created);
    }) as any;
  }
}
