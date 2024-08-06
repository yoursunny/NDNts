import { Forwarder, type FwFace } from "@ndn/fw";
import type { NameLike } from "@ndn/packet";
import { Decoder } from "@ndn/tlv";
import { assert, Closers, delay, pushable, randomJitter } from "@ndn/util";
import { filter, map, pipeline, transform } from "streaming-iterables";
import type { Except } from "type-fest";

import { L3Face } from "./l3face";
import { Transport } from "./transport";

class BridgeTransport extends Transport {
  public override readonly rx: Transport.RxIterable;
  public bridgePeer?: BridgeTransport;
  private readonly bridgeRx = pushable<Uint8Array>();

  constructor(bridgeName: string, relay: Bridge.RelayFunc, private readonly closePromise: Promise<void>) {
    super({ describe: `BRIDGE(${bridgeName})` });
    this.rx = map((wire) => new Decoder(wire).read(), relay(this.bridgeRx));
  }

  public override async tx(iterable: Transport.TxIterable) {
    assert(this.bridgePeer, "bridgePeer must be set");
    const iterator = iterable[Symbol.asyncIterator]();
    while (true) {
      const result = await Promise.race([
        iterator.next(),
        this.closePromise,
      ]);
      if (!result || result.done) { // normal close
        return;
      }
      const copy = result.value.slice();
      this.bridgePeer.bridgeRx.push(copy);
    }
  }
}

/**
 * A bridge passes packets between two logical forwarders.
 * Disposing the bridge severs the link.
 */
export interface Bridge extends Disposable {
  readonly fwA: Forwarder;
  readonly fwB: Forwarder;
  /** Face on fwA linking to fwB. */
  readonly faceA: FwFace;
  /** Face on fwB linking to fwA. */
  readonly faceB: FwFace;

  /** Change fw* and face* property names. */
  rename: <A extends string, B extends string>(A: A, B: B) => Bridge.Renamed<A, B>;
}

function makeRelayFunc(relay: Bridge.Relay): Bridge.RelayFunc {
  if (typeof relay === "function") {
    return relay;
  }
  const {
    loss = 0,
    delay: delayMs = 1,
    jitter = 0,
  } = relay;
  const delayJitter = randomJitter(jitter, delayMs);
  return (it) => pipeline(
    () => it,
    filter(() => loss === 0 || Math.random() >= loss),
    transform(64, async (pkt) => {
      await delay(delayJitter());
      return pkt;
    }),
  );
}

function rename<A extends string, B extends string>(this: Bridge, A: A, B: B): Bridge.Renamed<A, B> {
  assert(A as string !== B as string, "A and B must be different");
  const map = {
    [`fw${A}`]: "fwA",
    [`fw${B}`]: "fwB",
    [`face${A}`]: "faceA",
    [`face${B}`]: "faceB",
  };
  return new Proxy(this as unknown as Bridge.Renamed<A, B>, {
    get(target, prop, receiver) {
      if (typeof prop === "string" && map[prop]) {
        prop = map[prop] as any;
      }
      return Reflect.get(target, prop, receiver);
    },
  });
}

export namespace Bridge {
  /**
   * Function to relay packets between two logical forwarders.
   * @param it - stream of packet buffers received from peer side.
   * @returns stream of packet buffers injected into our side.
   */
  export type RelayFunc = (it: AsyncIterable<Uint8Array>) => AsyncIterable<Uint8Array>;

  /** Options to relay packets with loss, delay, and jitter. */
  export interface RelayOptions {
    /**
     * Packet loss rate between 0.0 (no loss) and 1.0 (100% loss).
     * @defaultValue 0
     */
    loss?: number;

    /**
     * Median delay in milliseconds.
     * @defaultValue 1
     */
    delay?: number;

    /* eslint-disable tsdoc/syntax -- tsdoc-missing-reference */
    /**
     * Jitter around median delay.
     * @defaultValue 0
     * @see {@link \@ndn/util!randomJitter}
     */
    /* eslint-enable tsdoc/syntax */
    jitter?: number;
  }

  export type Relay = RelayFunc | RelayOptions;

  /** {@link create} options. */
  export interface CreateOptions {
    /** Description for debugging purpose. */
    bridgeName?: string;

    /**
     * Forwarder A.
     * @defaultValue `Forwarder.create(.fwOpts)`
     * @remarks
     * Disposing the bridge closes auto-created Forwarder but not passed-in Forwarder.
     */
    fwA?: Forwarder;

    /**
     * Forwarder B.
     * @defaultValue `Forwarder.create(.fwOpts)`
     * @remarks
     * Disposing the bridge closes auto-created Forwarder but not passed-in Forwarder.
     */
    fwB?: Forwarder;

    /**
     * Options for creating Forwarder instances via {@link Forwarder.create}.
     * @remarks
     * Ignored if both `.fwA` and `.fwB` are specified.
     */
    fwOpts?: Forwarder.Options;

    /**
     * Relay options for packets from forwarder A to forwarder B.
     * @defaultValue instant delivery
     */
    relayAB?: Relay;

    /**
     * Relay options for packets from forwarder B to forwarder A.
     * @defaultValue instant delivery
     */
    relayBA?: Relay;

    /**
     * Routes from forwarder A to forwarder B.
     * @defaultValue `["/"]`
     */
    routesAB?: readonly NameLike[];

    /**
     * Routes from forwarder B to forwarder A.
     * @defaultValue `["/"]`
     */
    routesBA?: readonly NameLike[];
  }

  /** Create a bridge that passes packets between two logical forwarders. */
  export function create({
    bridgeName = "bridge",
    fwA,
    fwB,
    fwOpts,
    relayAB = (x) => x,
    relayBA = (x) => x,
    routesAB,
    routesBA,
  }: CreateOptions = {}): Bridge {
    const closers = new Closers();
    const closing = closers.wait();
    if (!fwA) {
      closers.push((fwA = Forwarder.create(fwOpts)));
    }
    if (!fwB) {
      closers.push((fwB = Forwarder.create(fwOpts)));
    }

    const tA = new BridgeTransport(bridgeName, makeRelayFunc(relayBA), closing);
    const tB = new BridgeTransport(bridgeName, makeRelayFunc(relayAB), closing);
    tA.bridgePeer = tB;
    tB.bridgePeer = tA;

    const faceA = fwA.addFace(new L3Face(tA, { advertiseFrom: false }));
    L3Face.processAddRoutes(faceA, routesAB);
    const faceB = fwB.addFace(new L3Face(tB, { advertiseFrom: false }));
    L3Face.processAddRoutes(faceB, routesBA);
    closers.push(faceA, faceB);

    return {
      fwA,
      fwB,
      faceA,
      faceB,
      rename,
      [Symbol.dispose]: closers.close,
    };
  }

  export type Renamed<A extends string, B extends string> =
    Except<Bridge, "fwA" | "fwB" | "faceA" | "faceB"> &
    { [k in `fw${A | B}`]: Forwarder; } &
    { [k in `face${A | B}`]: FwFace; };

  /** {@link star} options, where each edge/leaf can have different options. */
  export type StarEdgeOptions = Except<CreateOptions, "fwA">;

  /** {@link star} options, where every edge/leaf has the same options. */
  export type StarOptions = Except<StarEdgeOptions, "fwB"> & {
    /** Number of leaf nodes. */
    leaves: number;
  };

  /**
   * Create a star topology made with bridges.
   * @param opts - Per-leaf options.
   * @param fwA - Center logical forwarder node.
   *
   * @remarks
   * The star topology consists of `fwA` as the center node, and `fwB`s from each of `opts` as
   * leaf nodes. A-to-B goes toward the leaf; B-to-A goes toward the center.
   */
  export function star(opts: StarOptions | readonly StarEdgeOptions[], fwA = Forwarder.create()): Bridge[] {
    if (!Array.isArray(opts)) {
      const a = Array.from<StarEdgeOptions>({ length: (opts as StarOptions).leaves });
      a.fill(opts as StarOptions);
      opts = a;
    }
    return opts.map((opt, i) => Bridge.create({
      fwA,
      bridgeName: `star[${i}]`,
      ...opt,
    }));
  }
}
