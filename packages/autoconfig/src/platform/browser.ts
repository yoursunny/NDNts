import { Transport } from "@ndn/l3face";
import { WsTransport } from "@ndn/ws-transport";

import { connect } from "../mod";

export const fetch = self.fetch;

export const FCH_ALWAYS_CAPABILITIES = ["wss"];

export function createTransport(host: string, opts: connect.Options): Promise<Transport> {
  return WsTransport.connect(`wss://${host}/ws/`);
}

export async function getDefaultGateway(): Promise<string> {
  throw new Error("no default gateway in browser");
}
