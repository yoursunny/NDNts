import type { FwFace } from "@ndn/fw";
import { TcpTransport, UdpTransport } from "@ndn/node-transport";
import defaultGateway from "default-gateway";
import nodeFetch from "node-fetch";

import type { connect } from "./connect";

export const fetch = nodeFetch;

export const FCH_ALWAYS_CAPABILITIES = [];

export function createFace(host: string, {
  fw,
  preferProtocol = "udp",
  mtu,
  connectTimeout,
}: connect.Options): Promise<FwFace> {
  if (preferProtocol === "udp") {
    return UdpTransport.createFace({ fw, lp: { mtu } }, { host });
  }
  return TcpTransport.createFace({ fw }, { host, connectTimeout });
}

export async function getDefaultGateway(): Promise<string> {
  const result = await defaultGateway.v4();
  return result.gateway;
}
