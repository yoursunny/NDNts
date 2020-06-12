import { Transport } from "@ndn/l3face";
import { TcpTransport } from "@ndn/node-transport";
import defaultGateway from "default-gateway";
import nodeFetch from "node-fetch";

import type { connect } from "./connect";

export const fetch = nodeFetch;

export const FCH_ALWAYS_CAPABILITIES = [];

export function createTransport(host: string, { connectTimeout }: connect.Options): Promise<Transport> {
  return TcpTransport.connect({ host, port: 6363, connectTimeout });
}

export async function getDefaultGateway(): Promise<string> {
  const result = await defaultGateway.v4();
  return result.gateway;
}
