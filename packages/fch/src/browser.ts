import { Transport } from "@ndn/l3face";
import { WsTransport } from "@ndn/ws-transport";

import { connect, queryFch } from ".";

export const fetch = self.fetch;

export function overrideOptions(opts: Required<queryFch.Options>) {
  const caps = new Set(opts.capabilities);
  caps.add("wss");
  opts.capabilities = Array.from(caps);
}

export function createTransport(host: string, opts: Required<connect.Options>): Promise<Transport> {
  return WsTransport.connect(`wss://${host}/ws/`);
}
