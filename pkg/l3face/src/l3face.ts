import { Forwarder, type FwFace, FwPacket } from "@ndn/fw";
import { LpService } from "@ndn/lp";
import { Interest, type NameLike } from "@ndn/packet";
import { asDataView, CustomEvent, pushable } from "@ndn/util";
import { abortableSource, AbortError as IteratorAbortError } from "abortable-iterator";
import * as retry from "retry";
import { consume, filter, map, pipeline } from "streaming-iterables";
import type { Promisable } from "type-fest";
import { TypedEventTarget } from "typescript-event-target";

import { Transport } from "./transport";

type EventMap = {
  /** Emitted upon face state change. */
  state: L3Face.StateEvent;
  /** Emitted upon state becomes UP. */
  up: Event;
  /** Emitted upon state becomes DOWN. */
  down: CustomEvent<Error>;
  /** Emitted upon state becomes CLOSED. */
  close: Event;
  /** Emitted upon RX decoding error. */
  rxerror: CustomEvent<L3Face.RxError>;
  /** Emitted upon TX preparation error. */
  txerror: CustomEvent<L3Face.TxError>;
};

/** Network layer face for sending and receiving L3 packets. */
export class L3Face extends TypedEventTarget<EventMap> implements FwFace.RxTx {
  /**
   * Constructor.
   * @param transport - Initial transport. It may be replaced through reopen mechanism.
   * @param attributes - Additional attributes.
   * L3Face attributes consist of transport attributes overridden by these attributes.
   * @param lpOptions - NDNLPv2 service options.
   */
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
    this.lp = new LpService(lpOptions, transport);
    this.rx = this.makeRx();
  }

  /**
   * Attributes of a network layer face.
   *
   * @remarks
   * When L3Face is added to a logical forwarder, this is copied to {@link FwFace.attributes}.
   */
  public readonly attributes: L3Face.Attributes;
  public readonly lp: LpService;
  public readonly rx: AsyncIterable<FwPacket>;
  private readonly wireTokenPrefix = Math.trunc(Math.random() * 0x10000);

  /**
   * Obtain face UP/DOWN state.
   * @remarks
   * Caller can get notifications about state transitions via state/up/down/close events.
   */
  public get state() { return this.state_; }
  private set state(newState) {
    if (newState === this.state_) {
      return;
    }
    const evt = new L3Face.StateEvent("state", newState, this.state_);
    this.state_ = newState;
    this.dispatchTypedEvent("state", evt);
    switch (newState) {
      case L3Face.State.UP: {
        this.dispatchTypedEvent("up", new Event("up"));
        break;
      }
      case L3Face.State.DOWN: {
        const err = this.lastError instanceof Error ?
          this.lastError :
          new Error(`${this.lastError ?? "unknown error"}`);
        this.dispatchTypedEvent("down", new CustomEvent("down", { detail: err }));
        this.lastError = undefined;
        break;
      }
      case L3Face.State.CLOSED: {
        this.dispatchTypedEvent("close", new Event("close"));
        break;
      }
    }
  }

  private state_: L3Face.State = L3Face.State.UP;
  private lastError?: unknown;
  private readonly rxSources = pushable<Transport["rx"]>();
  private reopenRetry?: retry.RetryOperation;

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

  private async *rxTransform(transportRx: Transport.RxIterable): AsyncIterable<FwPacket> {
    yield* pipeline(
      () => transportRx,
      this.lp.rx,
      filter((pkt): pkt is LpService.Packet => {
        if (pkt instanceof LpService.RxError) {
          this.dispatchTypedEvent("rxerror", new CustomEvent("rxerror", { detail: pkt }));
          return false;
        }
        return true;
      }),
      map(({ l3, token: wireToken, congestionMark }: LpService.Packet): FwPacket => {
        let internalToken: Uint8Array | number | undefined;
        if (l3 instanceof Interest) {
          internalToken = wireToken;
        } else if (wireToken?.length === 6) {
          const dv = asDataView(wireToken);
          if (dv.getUint16(0) === this.wireTokenPrefix) {
            internalToken = dv.getUint32(2);
          }
        }
        return FwPacket.create(l3, internalToken, congestionMark);
      }),
    );
  }

  private txTransform(fwTx: AsyncIterable<FwPacket>): Transport.TxIterable {
    return pipeline(
      () => fwTx,
      filter((pkt: FwPacket) => FwPacket.isEncodable(pkt)),
      map(({ l3, token: internalToken, congestionMark }: FwPacket): LpService.Packet => {
        let wireToken: Uint8Array | undefined;
        if (typeof internalToken === "number") {
          wireToken = new Uint8Array(6);
          const dv = asDataView(wireToken);
          dv.setUint16(0, this.wireTokenPrefix);
          dv.setUint32(2, internalToken);
        } else if (internalToken instanceof Uint8Array) {
          wireToken = internalToken;
        }
        return { l3, token: wireToken, congestionMark };
      }),
      this.lp.tx,
      filter((value: Uint8Array | LpService.TxError): value is Uint8Array => {
        if (value instanceof LpService.TxError) {
          this.dispatchTypedEvent("txerror", new CustomEvent("txerror", { detail: value }));
          return false;
        }
        return true;
      }),
    );
  }

  public readonly tx = async (iterable: AsyncIterable<FwPacket>) => {
    const txSourceIterator = this.txTransform(iterable)[Symbol.asyncIterator]();
    const txSourceIterable: AsyncIterable<Uint8Array> = {
      [Symbol.asyncIterator]: () => ({
        next: () => txSourceIterator.next(),
      }),
    };

    while (this.state !== L3Face.State.CLOSED) {
      if (this.state === L3Face.State.DOWN) {
        this.reopenTransport();
      }

      const abort = new AbortController();
      this.addEventListener("state", () => abort.abort(), { once: true, signal: abort.signal });

      try {
        const txSource = abortableSource<Uint8Array>(txSourceIterable, abort.signal);
        if (this.state === L3Face.State.UP) {
          this.rxSources.push(abortableSource(this.transport.rx, abort.signal));
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
      }
    }
    this.reopenRetry?.stop();
    this.rxSources.stop();
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
  /** Face state. */
  export enum State {
    UP,
    DOWN,
    CLOSED,
  }

  export class StateEvent extends Event {
    constructor(
        type: string,
        public readonly state: State,
        public readonly prev: State,
    ) {
      super(type);
    }
  }

  export interface Attributes extends Transport.Attributes {
    /* eslint-disable tsdoc/syntax -- tsdoc-missing-reference */
    /**
     * Whether to readvertise registered routes.
     * @defaultValue `false`.
     * This default is set in {@link CreateFaceFunc} but could be different elsewhere.
     * @remarks
     * This attribute passed to {@link \@ndn/fw!FwFace.Attributes.advertiseFrom}. With the default
     * `false` value, routes "announced" by an L3Face would not be readvertised to
     * {@link \@ndn/fw!ReadvertiseDestination}s, so that remote forwarders would not depend on the
     * local logical forwarder to forward Interests between L3Faces.
     */
    /* eslint-enable tsdoc/syntax */
    advertiseFrom?: boolean;
  }

  export type RxError = LpService.RxError;
  export type TxError = LpService.TxError;

  /** Options to `createFace` as first parameter. */
  export interface CreateFaceOptions {
    /**
     * Forwarder instance to add the face to.
     * @defaultValue `Forwarder.getDefault()`
     */
    fw?: Forwarder;

    /**
     * Routes to be added on the created face.
     * @defaultValue `["/"]`
     */
    addRoutes?: readonly NameLike[];

    /**
     * L3Face attributes.
     *
     * @remarks
     * `.l3.advertiseFrom` defaults to false in createFace function.
     */
    l3?: Attributes;

    /** NDNLP service options. */
    lp?: LpService.Options;

    /**
     * A callback to receive {@link Transport}, {@link L3Face}, and {@link FwFace} objects.
     *
     * @remarks
     * This can be useful for reading counters or listening to events on these objects.
     */
    callback?: (transport: Transport, l3face: L3Face, fwFace: FwFace) => void;
  }

  export type CreateFaceFunc<
    P extends any[],
  > = (opts: CreateFaceOptions, ...args: P) => Promise<FwFace>;

  export type CreateFacesFunc<
    P extends any[],
  > = (opts: CreateFaceOptions, ...args: P) => Promise<FwFace[]>;

  /** Make a function to create a FwFace from a function that creates a transport. */
  export function makeCreateFace<P extends any[]>(createTransport: (...args: P) => Promisable<Transport>): CreateFaceFunc<P>;

  /** Make a function to create FwFaces from a function that creates transports. */
  export function makeCreateFace<P extends any[]>(createTransports: (...args: P) => Promisable<Transport[]>): CreateFacesFunc<P>;

  export function makeCreateFace(createTransport: (...args: any[]) => Promisable<any>): any {
    return (async ({
      fw = Forwarder.getDefault(),
      addRoutes,
      l3,
      lp,
      callback,
    }: CreateFaceOptions, ...args: any[]) => {
      const created = await createTransport(...args);
      const makeFace = (transport: Transport) => {
        const l3face = new L3Face(transport, { advertiseFrom: false, ...l3 }, lp);
        const fwFace = fw.addFace(l3face);
        processAddRoutes(fwFace, addRoutes);
        callback?.(transport, l3face, fwFace);
        return fwFace;
      };
      return Array.isArray(created) ? created.map(makeFace) : makeFace(created);
    });
  }

  /**
   * Add routes to a FwFace.
   * @param fwFace - Target FwFace.
   * @param addRoutes - List of routes.
   * @remarks
   * This function is typically used for implementing {@link CreateFaceOptions.addRoutes}.
   */
  export function processAddRoutes(fwFace: FwFace, addRoutes: readonly NameLike[] = ["/"]): void {
    for (const routeName of addRoutes) {
      fwFace.addRoute(routeName);
    }
  }
}
