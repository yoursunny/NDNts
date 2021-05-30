import { Name } from "@ndn/packet";

import { FCH_DEFAULTS, fetch } from "./platform_node";

/** FCH service request. */
export interface FchRequest {
  /** FCH service URI. */
  server?: string;
  /** Number of routers. Ignored if transports is a Record. */
  count?: number;
  /** Transport protocols. */
  transports?: readonly string[] | Record<string, number>;
  /** IPv4 allowed. */
  ipv4?: boolean;
  /** IPv6 allowed. */
  ipv6?: boolean;
  /** Client position. */
  position?: [lon: number, lat: number];
  /** AbortSignal. */
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
  const { signal } = req;
  const tcs = parseTransportCounts(req);
  const res = new FchResp();

  try {
    const hRes = await fetch(makeRequest(req, tcs), {
      headers: {
        Accept: "application/json, text/plain, */*",
      },
      signal,
    });
    if (!hRes.ok) {
      throw new Error(`HTTP ${hRes.status}`);
    }

    if (hRes.headers.get("Content-Type")?.startsWith("application/json")) {
      await res.setJsonResponse(hRes);
      return res;
    }

    if (tcs.length === 1) {
      await res.addTextResponse(tcs[0]!.transport, hRes);
      return res;
    }
  } catch {}

  await Promise.all(tcs.map(async (tc) => {
    try {
      const hRes = await fetch(makeRequest(req, [tc]), {
        headers: {
          Accept: "text/plain, */*",
        },
        signal,
      });
      if (!hRes.ok) {
        throw new Error(`HTTP ${hRes.status}`);
      }
      await res.addTextResponse(tc.transport, hRes);
    } catch {}
  }));
  return res;
}

interface TransportCount {
  transport: string;
  count: number;
}

function parseTransportCounts({
  count = 1,
  transports = FCH_DEFAULTS.transports(),
}: FchRequest): TransportCount[] {
  if (Array.isArray(transports)) {
    return (transports as readonly string[])
      .map((transport) => ({ transport, count }));
  }
  return Object.entries(transports as Record<string, number>)
    .map(([transport, count]) => ({ transport, count }));
}

function makeRequest(req: FchRequest, tc: readonly TransportCount[]): string {
  const {
    server = "https://fch.ndn.today",
    ipv4 = FCH_DEFAULTS.hasIPv4(),
    ipv6 = FCH_DEFAULTS.hasIPv6(),
    position,
  } = req;

  const uri = new URL(server);
  for (const { transport, count } of tc) {
    uri.searchParams.append("cap", transport);
    uri.searchParams.append("k", `${count}`);
  }
  setBoolParam(uri.searchParams, "ipv4", ipv4);
  setBoolParam(uri.searchParams, "ipv6", ipv6);
  if (position?.length === 2) {
    const [lon, lat] = position;
    uri.searchParams.set("lon", `${lon.toFixed(5)}`);
    uri.searchParams.set("lat", `${lat.toFixed(5)}`);
  }
  return uri.toString();
}

function setBoolParam(search: URLSearchParams, name: string, value: boolean|undefined): void {
  if (typeof value === "boolean") {
    search.set(name, `${Number(value)}`);
  }
}

class FchResp implements FchResponse {
  public updated?: Date;
  public routers: FchResponse.Router[] = [];

  public async setJsonResponse(hRes: Response): Promise<void> {
    const body = await hRes.json();
    this.updated = new Date(body.updated);
    this.routers = (body.routers as Array<Record<string, string>>).map((r) => ({
      transport: r.transport!,
      connect: r.connect!,
      prefix: r.prefix ? new Name(r.prefix) : undefined,
    }));
  }

  public async addTextResponse(transport: string, hRes: Response): Promise<void> {
    const body = await hRes.text();
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
