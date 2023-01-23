import type { FwFace } from "@ndn/fw";
import { WsTransport } from "@ndn/ws-transport";

import type { PlatformFchDefaults } from "./fch";
import type { ConnectRouterOptions } from "./router";

export const fetch = globalThis.fetch;

export const FCH_DEFAULTS: PlatformFchDefaults = {
  transports({ H3Transport } = {}) {
    const list = ["wss"];
    if (H3Transport?.supported) {
      list.push("http3");
    }
    return list;
  },
};

export async function getDefaultGateway(): Promise<string> {
  throw new Error("no default gateway in browser");
}

export function createFace(router: string, {
  fw,
  H3Transport,
  mtu = 1200,
  connectTimeout,
  addRoutes,
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
    case "wss:": {
      return WsTransport.createFace({ fw, addRoutes }, uri.toString(), { connectTimeout });
    }
    case "https:": {
      if (!H3Transport) {
        throw new Error("H3Transport unavailable");
      }
      return H3Transport.createFace({ fw, addRoutes, lp: { mtu } }, uri.toString());
    }
    default: {
      throw new Error(`unknown protocol ${uri.protocol}`);
    }
  }
}
