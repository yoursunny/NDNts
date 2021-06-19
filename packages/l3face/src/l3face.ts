import { Forwarder, FwFace, FwPacket } from "@ndn/fw";
import { LpService } from "@ndn/lp";
import { Interest } from "@ndn/packet";
import { Encoder } from "@ndn/tlv";
import AbortController from "abort-controller";
import abortable, { AbortError as IteratorAbortError } from "abortable-iterator";
import { EventEmitter } from "events";
import pushable from "it-pushable";
import pEvent from "p-event";
import * as retry from "retry";
import { consume, filter, map, pipeline } from "streaming-iterables";
import type TypedEmitter from "typed-emitter";

import { Transport } from "./transport";

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

/** Network layer face for sending and receiving L3 packets. */
export class L3Face extends (EventEmitter as new() => TypedEmitter<Events>) implements FwFace.RxTx {
  public readonly attributes: L3Face.Attributes;
  public readonly lp: LpService;
  public readonly rx: AsyncIterable<FwPacket>;
  private readonly wireTokenPrefix = Math.floor(Math.random() * 0x10000);

  public get state() { return this.state_; }
  private set state(newState) {
    if (newState === this.state_) {
      return;
    }
    this.state_ = newState;
    this.emit("state", newState);
    switch (newState) {
      case L3Face.State.UP:
        this.emit("up");
        break;
      case L3Face.State.DOWN: {
        const err = this.lastError instanceof Error ?
          this.lastError :
          new Error(`${this.lastError ?? "unknown error"}`);
        this.emit("down", err);
        this.lastError = undefined;
        break;
      }
      case L3Face.State.CLOSED:
        this.emit("close");
        break;
    }
  }

  private state_: L3Face.State = L3Face.State.UP;
  private lastError?: unknown;
  private readonly rxSources = pushable<Transport["rx"]>();
  private reopenRetry?: retry.RetryOperation;

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
  }

  private async *makeRx(): AsyncIterable<FwPacket> {
    for await (const source of this.rxSources) {
      try {
        yield* this.rxTransform(source);
        this.lastError = new Error("RX ending");
        this.state = L3Face.State.DOWN;
      } catch (err: unknown) {
        if (!(err instanceof IteratorAbortError)) {
          this.lastError = err;
          this.state = L3Face.State.DOWN;
        }
      }
    }
  }

  private async *rxTransform(transportRx: Transport.Rx): AsyncIterable<FwPacket> {
    yield* pipeline(
      () => transportRx,
      this.lp.rx,
      filter((pkt): pkt is LpService.Packet => {
        if (pkt instanceof LpService.RxError) {
          this.emit("rxerror", pkt);
          return false;
        }
        return true;
      }),
      map(({ l3, token: wireToken }: LpService.Packet) => {
        let internalToken: Uint8Array | number | undefined;
        if (l3 instanceof Interest) {
          internalToken = wireToken;
        } else if (wireToken?.length === 6) {
          const dv = Encoder.asDataView(wireToken);
          if (dv.getUint16(0) === this.wireTokenPrefix) {
            internalToken = dv.getUint32(2);
          }
        }
        return FwPacket.create(l3, internalToken);
      }),
    );
  }

  private txTransform(fwTx: AsyncIterable<FwPacket>): AsyncIterable<Uint8Array> {
    return pipeline(
      () => fwTx,
      filter((pkt: FwPacket) => FwPacket.isEncodable(pkt)),
      map(({ l3, token: internalToken }: FwPacket) => {
        let wireToken: Uint8Array | undefined;
        if (typeof internalToken === "number") {
          wireToken = new Uint8Array(6);
          const dv = Encoder.asDataView(wireToken);
          dv.setUint16(0, this.wireTokenPrefix);
          dv.setUint32(2, internalToken);
        } else if (internalToken instanceof Uint8Array) {
          wireToken = internalToken;
        }
        return { l3, token: wireToken };
      }),
      this.lp.tx,
      filter((value: Uint8Array | LpService.TxError): value is Uint8Array => {
        if (value instanceof LpService.TxError) {
          this.emit("txerror", value);
          return false;
        }
        return true;
      }),
    );
  }

  public tx = async (iterable: AsyncIterable<FwPacket>) => {
    const txSourceIterator = this.txTransform(iterable)[Symbol.asyncIterator]();
    txSourceIterator.return = undefined;
    while (this.state !== L3Face.State.CLOSED) {
      if (this.state === L3Face.State.DOWN) {
        this.reopenTransport();
      }

      const abort = new AbortController();
      const onStateChange = pEvent(this, "state");
      // eslint-disable-next-line promise/prefer-await-to-then
      void onStateChange.then(() => abort.abort());

      try {
        const txSource = abortable<Uint8Array>(txSourceIterator as any, abort.signal);
        if (this.state === L3Face.State.UP) {
          this.rxSources.push(abortable(this.transport.rx, abort.signal));
          await this.transport.tx(txSource);
        } else {
          await consume(txSource);
        }
        this.state = L3Face.State.CLOSED;
      } catch (err: unknown) {
        if (!(err instanceof IteratorAbortError)) {
          this.lastError = err;
          this.state = L3Face.State.DOWN;
        }
      } finally {
        abort.abort();
        onStateChange.cancel();
      }
    }
    this.reopenRetry?.stop();
    this.rxSources.end();
  };

  private reopenTransport(): void {
    this.reopenRetry?.stop();
    this.reopenRetry = retry.operation({
      forever: true,
      minTimeout: 100,
      maxTimeout: 60000,
      randomize: true,
    });
    this.reopenRetry.attempt(async () => {
      try {
        this.transport = await this.transport.reopen();
      } catch (err: unknown) {
        if (!(err instanceof Transport.ReopenNotSupportedError)) {
          this.reopenRetry!.retry(err as Error);
        }
        return;
      }

      if (this.state === L3Face.State.CLOSED) {
        // eslint-disable-next-line @typescript-eslint/no-empty-function
        void this.transport.tx((async function*() {})()); // shutdown transport
        return;
      }

      this.reopenRetry!.stop();
      this.state = L3Face.State.UP;
    });
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
    R extends Transport | Transport[],
  > = (opts: CreateFaceOptions, ...args: P) => Promise<R extends Transport[] ? FwFace[] : FwFace>;

  export function makeCreateFace<
    C extends (...args: any[]) => Promise<Transport | Transport[]>,
    P extends any[] = C extends (...args: infer P) => any ? P : never,
    R extends Transport | Transport[] = C extends (...args: any[]) => Promise<infer R> ? R : never,
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
