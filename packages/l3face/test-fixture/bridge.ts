import type { Forwarder, FwFace } from "@ndn/fw";
import type { NameLike } from "@ndn/packet";
import { Decoder } from "@ndn/tlv";
import { delay, randomJitter } from "@ndn/util";
import { pushable } from "it-pushable";
import pDefer from "p-defer";
import { filter, map, pipeline, transform } from "streaming-iterables";

import { L3Face, Transport } from "..";

class BridgeTransport extends Transport {
  public override readonly rx: Transport.Rx;
  public bridgePeer?: BridgeTransport;
  private readonly bridgeRx = pushable<Uint8Array>({ objectMode: true });

  constructor(bridgeName: string, relay: Bridge.RelayFunc, private readonly closePromise: Promise<false>) {
    super({ describe: `BRIDGE(${bridgeName})` });
    this.rx = map((wire) => new Decoder(wire).read(), relay(this.bridgeRx));
  }

  public override readonly tx = async (iterable: AsyncIterable<Uint8Array>) => {
    const iterator = iterable[Symbol.asyncIterator]();
    while (true) {
      const result = await Promise.race([
        iterator.next(),
        this.closePromise,
      ]);
      if (!result || result.done) { // normal close
        return;
      }
      const copy = new Uint8Array(result.value);
      this.bridgePeer?.bridgeRx.push(copy);
    }
  };
}

/** A bridge that links two forwarders. */
export interface Bridge extends Disposable {
  faceA: FwFace;
  faceB: FwFace;
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

export namespace Bridge {
  export type RelayFunc = (it: AsyncIterable<Uint8Array>) => AsyncIterable<Uint8Array>;

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
    bridgeName?: string;
    fwA: Forwarder;
    fwB: Forwarder;
    relayAB?: Relay;
    relayBA?: Relay;
    routesAB?: readonly NameLike[];
    routesBA?: readonly NameLike[];
  }

  /**
   * Create a bridge that links two forwarders.
   * The relay functions can inject loss, delay, and jitter to the simulated link.
   */
  export function create({
    bridgeName = "bridge",
    fwA,
    fwB,
    relayAB = (x) => x,
    relayBA = (x) => x,
    routesAB,
    routesBA,
  }: CreateOptions): Bridge {
    const close = pDefer<false>();
    const tA = new BridgeTransport(bridgeName, makeRelayFunc(relayBA), close.promise);
    const tB = new BridgeTransport(bridgeName, makeRelayFunc(relayAB), close.promise);
    tA.bridgePeer = tB;
    tB.bridgePeer = tA;
    const faceA = fwA.addFace(new L3Face(tA, { advertiseFrom: false }));
    L3Face.processAddRoutes(faceA, routesAB);
    const faceB = fwB.addFace(new L3Face(tB, { advertiseFrom: false }));
    L3Face.processAddRoutes(faceB, routesBA);
    return {
      faceA,
      faceB,
      [Symbol.dispose]() {
        faceA.close();
        faceB.close();
        close.resolve(false);
      },
    };
  }
}
