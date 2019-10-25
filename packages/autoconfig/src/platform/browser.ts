import { Transport } from "@ndn/l3face";
import { WsTransport } from "@ndn/ws-transport";

import { connect, queryFch } from "..";

export const fetch = self.fetch;

export function overrideFchOptions(opts: queryFch.Options) {
  const caps = new Set(opts.capabilities);
  caps.add("wss");
  opts.capabilities = Array.from(caps);
}

export function createTransport(host: string, opts: connect.Options): Promise<Transport> {
  return WsTransport.connect(`wss://${host}/ws/`);
}

export async function getDefaultGateway(): Promise<string> {
  throw new Error("no default gateway in browser");
}
