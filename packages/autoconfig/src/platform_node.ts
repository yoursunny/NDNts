import os from "node:os";

import type { FwFace } from "@ndn/fw";
import { splitHostPort, TcpTransport, UdpTransport } from "@ndn/node-transport";
import nodeFetch from "node-fetch";

import type { PlatformFchDefaults } from "./fch";
import type { ConnectRouterOptions } from "./router";

export function fetch(input: RequestInfo, init?: RequestInit): Promise<Response> {
  return nodeFetch(input as any, init as any) as any;
}

function hasAddressFamily(want: os.NetworkInterfaceInfo["family"]): boolean {
  return Object.values(os.networkInterfaces()).some(
    (addrs) => addrs?.some((addr) => addr.family === want && !addr.internal));
}

export const FCH_DEFAULTS: PlatformFchDefaults = {
  transports() { return ["udp"]; },
  get hasIPv4() { return hasAddressFamily("IPv4"); },
  get hasIPv6() { return hasAddressFamily("IPv6"); },
};

export async function getDefaultGateway(): Promise<string> {
  const defaultGateway = await import("default-gateway"); // allow mocking with import() function
  const result = await defaultGateway.gateway4async();
  return result.gateway;
}

export function createFace(router: string, {
  fw,
  preferTcp = false,
  mtu,
  connectTimeout,
  addRoutes,
}: ConnectRouterOptions): Promise<FwFace> {
  const { host, port } = splitHostPort(router);
  if (preferTcp) {
    return TcpTransport.createFace({ fw, addRoutes }, { host, port, connectTimeout });
  }
  return UdpTransport.createFace({ fw, addRoutes, lp: { mtu } }, { host, port });
}
