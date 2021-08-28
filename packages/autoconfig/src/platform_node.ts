import type { FwFace } from "@ndn/fw";
import { splitHostPort, TcpTransport, UdpTransport } from "@ndn/node-transport";
import defaultGateway from "default-gateway";
import * as os from "node:os";
import nodeFetch from "node-fetch";

import type { PlatformFchDefaults } from "./fch";
import type { ConnectRouterOptions } from "./router";

export function fetch(input: RequestInfo, init?: RequestInit): Promise<Response> {
  return nodeFetch(input as any, init as any) as any;
}

function hasAddressFamily(family: os.NetworkInterfaceInfo["family"]): () => boolean {
  return () => Object.values(os.networkInterfaces()).some(
    (addrs) => addrs?.some((addr) => addr.family === family));
}

export const FCH_DEFAULTS: PlatformFchDefaults = {
  transports() { return ["udp"]; },
  hasIPv4: hasAddressFamily("IPv4"),
  hasIPv6: hasAddressFamily("IPv6"),
};

export async function getDefaultGateway(): Promise<string> {
  const result = await defaultGateway.v4();
  return result.gateway;
}

export function createFace(router: string, {
  fw,
  preferTcp = false,
  mtu,
  connectTimeout,
}: ConnectRouterOptions): Promise<FwFace> {
  const { host, port } = splitHostPort(router);
  if (preferTcp) {
    return TcpTransport.createFace({ fw }, { host, port, connectTimeout });
  }
  return UdpTransport.createFace({ fw, lp: { mtu } }, { host, port });
}
