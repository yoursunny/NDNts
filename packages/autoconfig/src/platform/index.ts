import { Transport } from "@ndn/l3face";
import { SocketTransport } from "@ndn/node-transport";
import defaultGateway from "default-gateway";
import nodeFetch from "node-fetch";

import { connect, queryFch } from "..";

export const fetch = nodeFetch;

export function overrideFchOptions(opts: queryFch.Options) {
  return;
}

export function createTransport(host: string, opts: connect.Options): Promise<Transport> {
  return SocketTransport.connect({ host, port: 6363 });
}

export async function getDefaultGateway(): Promise<string> {
  const result = await defaultGateway.v4();
  return result.gateway;
}
