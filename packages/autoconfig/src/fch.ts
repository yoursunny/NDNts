import { Name } from "@ndn/packet";

import { FCH_DEFAULTS, fetch } from "./platform_node";
import type { ConnectRouterOptions } from "./router";

export interface PlatformFchDefaults {
  transports(opts?: ConnectRouterOptions): string[];
  readonly hasIPv4?: boolean;
  readonly hasIPv6?: boolean;
}

/** FCH service request. */
export interface FchRequest {
  /** FCH service URI. */
  server?: string;

  /**
   * Transport protocol, such as "udp".
   * Ignored if `transports` is specified.
   */
  transport?: string;

  /**
   * Number of routers.
   * Ignored if `transports` is a Record.
   */
  count?: number;

  /**
   * Transport protocols.
   * If this is an array of transport protocols, the quantity of each is specified by `count`.
   * If this is a Record, each key is a transport protocol and each value is the quantity.
   */
  transports?: readonly string[] | Record<string, number>;

  /** IPv4 allowed? */
  ipv4?: boolean;

  /** IPv6 allowed? */
  ipv6?: boolean;

  /** Client geolocation. */
  position?: [lon: number, lat: number];

  /** Network authority, such as "yoursunny". */
  network?: string;

  /** AbortSignal that allows canceling the request via AbortController. */
  signal?: AbortSignal;
}

/** FCH service response. */
export interface FchResponse {
  readonly updated?: Date;
  readonly routers: FchResponse.Router[];
}

export namespace FchResponse {
  export interface Router {
    transport: string;
    connect: string;
    prefix?: Name;
  }
}

/** FCH service query. */
export async function fchQuery(req: FchRequest = {}): Promise<FchResponse> {
  const {
    server = "https://fch.ndn.today",
    ipv4 = FCH_DEFAULTS.hasIPv4,
    ipv6 = FCH_DEFAULTS.hasIPv6,
    position,
    network,
    signal,
  } = req;
  const hQuery = async (tcs: TransportCount[], accept: string): Promise<Response> => {
    const uri = new URL(server);
    const search = uri.searchParams;
    for (const [transport, count] of tcs) {
      search.append("cap", transport);
      search.append("k", `${count}`);
    }
    if (ipv4 !== undefined) {
      search.set("ipv4", `${Number(ipv4)}`);
    }
    if (ipv6 !== undefined) {
      search.set("ipv6", `${Number(ipv6)}`);
    }
    if (position?.length === 2) {
      const [lon, lat] = position;
      search.set("lon", `${lon.toFixed(5)}`);
      search.set("lat", `${lat.toFixed(5)}`);
    }
    if (network) {
      search.set("network", network);
    }

    const hRes = await fetch(uri.toString(), { headers: { accept }, signal });
    if (!hRes.ok) {
      throw new Error(`HTTP ${hRes.status}`);
    }
    return hRes;
  };

  const tcs = parseTransportCounts(req);
  const res = new FchResp();

  try {
    const hRes = await hQuery(tcs, "application/json, text/plain, */*");
    if (hRes.headers.get("Content-Type")?.startsWith("application/json")) {
      await res.setJsonResponse(hRes);
      return res;
    }

    if (tcs.length === 1) {
      await res.addTextResponse(tcs[0]![0], hRes);
      return res;
    }
  } catch {}

  await Promise.all(tcs.map(async (tc) => {
    try {
      const hRes = await hQuery([tc], "text/plain, */*");
      await res.addTextResponse(tc[0], hRes);
    } catch {}
  }));
  return res;
}

type TransportCount = [transport: string, count: number];

function parseTransportCounts({
  transport,
  count = 1,
  transports,
}: FchRequest): TransportCount[] {
  if (transports === undefined) {
    if (transport) {
      return [[transport, count]];
    }
    transports = FCH_DEFAULTS.transports();
  }
  if (Array.isArray(transports)) {
    return (transports as readonly string[])
      .map((transport) => [transport, count]);
  }
  return Object.entries(transports as Record<string, number>);
}

class FchResp implements FchResponse {
  public updated?: Date;
  public routers: FchResponse.Router[] = [];

  public async setJsonResponse(hRes: Response): Promise<void> {
    const body = await hRes.json();
    this.updated = new Date(body.updated);
    this.routers = Array.from<Record<string, string>, FchResponse.Router>(body.routers, (r) => ({
      transport: String(r.transport),
      connect: String(r.connect),
      prefix: r.prefix ? new Name(r.prefix) : undefined,
    }));
  }

  public async addTextResponse(transport: string, hRes: Response): Promise<void> {
    const body = (await hRes.text()).trim();
    if (body === "") {
      return;
    }
    for (const connect of body.split(",")) {
      this.routers.push({
        transport,
        connect,
      });
    }
  }
}
