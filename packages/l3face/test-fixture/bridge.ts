import type { Forwarder, FwFace } from "@ndn/fw";
import type { NameLike } from "@ndn/packet";
import { Decoder } from "@ndn/tlv";
import { assert, delay } from "@ndn/util";
import { pushable } from "it-pushable";
import pDefer from "p-defer";
import { filter, map, pipeline, transform } from "streaming-iterables";

import { L3Face, Transport } from "..";

class BridgeTransport extends Transport {
  public override readonly rx: Transport.Rx;
  public bridgePeer?: BridgeTransport;
  private readonly bridgeRx = pushable<Uint8Array>({ objectMode: true });

  constructor(bridgeName: string, relay: Bridge.RelayFunc, private readonly closePromise: Promise<undefined>) {
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
export interface Bridge {
  faceA: FwFace;
  faceB: FwFace;
  close: () => void;
}

function makeRelayFunc(relay: Bridge.Relay): Bridge.RelayFunc {
  if (typeof relay === "function") {
    return relay;
  }
  const {
    minDelay = 1,
    maxDelay = 1,
    loss = 0,
  } = relay;
  assert(minDelay <= maxDelay);
  const delayRange = maxDelay - minDelay;
  return (it) => pipeline(
    () => it,
    filter(() => loss === 0 || Math.random() >= loss),
    transform(64, async (pkt) => {
      await delay(minDelay + delayRange * Math.random());
      return pkt;
    }),
  );
}

export namespace Bridge {
  export type RelayFunc = (it: AsyncIterable<Uint8Array>) => AsyncIterable<Uint8Array>;

  export interface RelayOptions {
    minDelay?: number;
    maxDelay?: number;
    loss?: number;
  }

  export type Relay = RelayFunc | RelayOptions;

  export interface CreateOptions {
    bridgeName?: string;
    fwA: Forwarder;
    fwB: Forwarder;
    relayAB?: Relay;
    relayBA?: Relay;
    routesAB?: NameLike[];
    routesBA?: NameLike[];
  }

  /**
   * Create a bridge that links two forwarders.
   * The relay functions can inject delay, loss, and jitter to the simulated link.
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
    const close = pDefer<undefined>();
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
      close() {
        faceA.close();
        faceB.close();
        close.resolve();
      },
    };
  }
}
