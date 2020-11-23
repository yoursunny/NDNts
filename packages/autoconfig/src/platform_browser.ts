import type { FwFace } from "@ndn/fw";
import { WsTransport } from "@ndn/ws-transport";

import type { connect } from "./connect";

export const fetch = globalThis.fetch;

export const FCH_ALWAYS_CAPABILITIES = ["wss"];

export function createFace(host: string, {
  fw,
  connectTimeout,
}: connect.Options): Promise<FwFace> {
  return WsTransport.createFace({ fw }, `wss://${host}/ws/`, { connectTimeout });
}

export async function getDefaultGateway(): Promise<string> {
  throw new Error("no default gateway in browser");
}
