import type { Forwarder, FwFace } from "@ndn/fw";
import { Decoder } from "@ndn/tlv";
import pushable from "it-pushable";
import pDefer from "p-defer";
import { filter, map, pipeline, transform } from "streaming-iterables";

import { L3Face, Transport } from "..";

class BridgeTransport extends Transport {
  public readonly rx: Transport.Rx;
  public bridgePeer?: BridgeTransport;
  private readonly bridgeRx = pushable<Uint8Array>();

  constructor(bridgeName: string, relay: Bridge.RelayFunc, private readonly closePromise: Promise<undefined>) {
    super({ describe: `BRIDGE(${bridgeName})` });
    this.rx = map((wire) => new Decoder(wire).read(), relay(this.bridgeRx));
  }

  public readonly tx = async (iterable: AsyncIterable<Uint8Array>) => {
    const iterator = iterable[Symbol.asyncIterator]();
    for (;;) {
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
  let {
    minDelay = 1,
    maxDelay = 1,
    loss = 0,
  } = relay;
  if (minDelay > maxDelay) {
    [minDelay, maxDelay] = [maxDelay, minDelay];
  }
  const delayRange = maxDelay - minDelay;
  return (it) => pipeline(
    () => it,
    filter(() => Math.random() >= loss),
    transform(64, async (pkt) => {
      await new Promise((r) => setTimeout(r, minDelay + delayRange * Math.random()));
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
    relayAB?: RelayFunc|RelayOptions;
    relayBA?: RelayFunc|RelayOptions;
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
  }: CreateOptions): Bridge {
    const close = pDefer<undefined>();
    const tA = new BridgeTransport(bridgeName, makeRelayFunc(relayBA), close.promise);
    const tB = new BridgeTransport(bridgeName, makeRelayFunc(relayAB), close.promise);
    tA.bridgePeer = tB;
    tB.bridgePeer = tA;
    const faceA = fwA.addFace(new L3Face(tA));
    const faceB = fwB.addFace(new L3Face(tB));
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
