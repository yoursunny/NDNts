import { Forwarder, type FwFace } from "@ndn/fw";
import type { NameLike } from "@ndn/packet";
import { Decoder } from "@ndn/tlv";
import { assert, Closers, delay, randomJitter } from "@ndn/util";
import { pushable } from "it-pushable";
import { filter, map, pipeline, transform } from "streaming-iterables";

import { L3Face } from "./l3face";
import { Transport } from "./transport";

class BridgeTransport extends Transport {
  public override readonly rx: Transport.Rx;
  public bridgePeer?: BridgeTransport;
  private readonly bridgeRx = pushable<Uint8Array>({ objectMode: true });

  constructor(bridgeName: string, relay: Bridge.RelayFunc, private readonly closePromise: Promise<void>) {
    super({ describe: `BRIDGE(${bridgeName})` });
    this.rx = map((wire) => new Decoder(wire).read(), relay(this.bridgeRx));
  }

  public override readonly tx = async (iterable: AsyncIterable<Uint8Array>) => {
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
  };
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
  rename<A extends string, B extends string>(A: A, B: B): Bridge.Renamed<A, B>;
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
   * @param it iterable of packet buffers received from peer side.
   * @returns iterable of packet buffers injected into our side.
   */
  export type RelayFunc = (it: AsyncIterable<Uint8Array>) => AsyncIterable<Uint8Array>;

  /** Options to relay packets with loss, delay, and jitter. */
  export interface RelayOptions {
    /**
     * Packet loss rate between 0.0 (no loss) and 1.0 (100% loss).
     * @default 0
     */
    loss?: number;

    /**
     * Median delay in milliseconds.
     * @default 1
     */
    delay?: number;

    /**
     * Jitter around median delay, see @ndn/util randomJitter function.
     * @default 0
     */
    jitter?: number;
  }

  export type Relay = RelayFunc | RelayOptions;

  export interface CreateOptions {
    /** Description for debugging purpose. */
    bridgeName?: string;

    /**
     * Forwarder A.
     * Default is a new Forwarder that can be retrieved with bridge.fwA .
     * Disposing the bridge closes auto-created Forwarder but not passed-in Forwarder.
     */
    fwA?: Forwarder;

    /**
     * Forwarder B.
     * Default is a new Forwarder that can be retrieved with bridge.fwB .
     * Disposing the bridge closes auto-created Forwarder but not passed-in Forwarder.
     */
    fwB?: Forwarder;

    /** Options for creating Forwarder instances. */
    fwOpts?: Forwarder.Options;

    /**
     * Relay options for packets from forwarder A to forwarder B.
     * Default is 0% loss and 1ms delay.
     */
    relayAB?: Relay;
    /**
     * Relay options for packets from forwarder B to forwarder A.
     * Default is 0% loss and 1ms delay.
     */
    relayBA?: Relay;

    /**
     * Routes from forwarder A to forwarder B.
     * Default is ["/"].
     */
    routesAB?: readonly NameLike[];
    /**
     * Routes from forwarder B to forwarder A.
     * Default is ["/"].
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

    return {
      fwA,
      fwB,
      faceA,
      faceB,
      rename,
      [Symbol.dispose]() {
        closers.close();
      },
    };
  }

  export type Renamed<A extends string, B extends string> = Disposable & {
    [k in `fw${A | B}`]: Forwarder;
  } & {
    [k in `face${A | B}`]: FwFace;
  };
}
