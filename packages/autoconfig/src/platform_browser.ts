import type { FwFace } from "@ndn/fw";
import { WsTransport } from "@ndn/ws-transport";

import type { ConnectRouterOptions } from "./router";

export const fetch = globalThis.fetch;

export const FCH_DEFAULTS = {
  transports({ H3Transport }: ConnectRouterOptions = {}) {
    const list = ["wss"];
    if (H3Transport?.supported) {
      list.push("http3");
    }
    return list;
  },
  hasIPv4() { return undefined; },
  hasIPv6() { return undefined; },
};

export async function getDefaultGateway(): Promise<string> {
  throw new Error("no default gateway in browser");
}

export function createFace(router: string, {
  fw,
  H3Transport,
  mtu = 1200,
  connectTimeout,
}: ConnectRouterOptions): Promise<FwFace> {
  const uri = (() => {
    try {
      return new URL(router);
    } catch {
      return new URL(`wss://${router}/ws/`);
    }
  })();

  switch (uri.protocol) {
    case "ws:":
    case "wss:":
      return WsTransport.createFace({ fw }, uri.toString(), { connectTimeout });
    case "https:":
      if (!H3Transport) {
        throw new Error("H3Transport unavailable");
      }
      return H3Transport.createFace({ fw, lp: { mtu } }, uri.toString());
    default:
      throw new Error(`unknown protocol ${uri.protocol}`);
  }
}
