import { FCH_DEFAULTS, fetch } from "./platform_node";

/** FCH service request. */
export interface FchRequest {
  server?: string;
  count?: number;
  transports?: readonly string[];
  ipv4?: boolean;
  ipv6?: boolean;
  position?: [lon: number, lat: number];
  signal?: AbortSignal;
}

/**
 * FCH service response.
 * Key is transport type. Value is a list of routers.
 */
export type FchResponse = Record<string, string[]>;

/** FCH service query. */
export async function fchQuery(req: FchRequest = {}): Promise<FchResponse> {
  const {
    transports = FCH_DEFAULTS.transports(),
    signal,
  } = req;

  try {
    const hRes = await fetch(makeRequest(req, transports), {
      headers: {
        Accept: "application/json, text/plain, */*",
      },
      signal,
    });
    if (!hRes.ok) {
      throw new Error(`HTTP ${hRes.status}`);
    }
    if (hRes.headers.get("Content-Type")?.startsWith("application/json")) {
      return await parseJsonResponse(hRes, transports);
    }
    if (transports.length === 1) {
      return {
        [transports[0]!]: await parseTextResponse(hRes),
      };
    }
  } catch {}

  return Object.fromEntries(await Promise.all(transports.map(async (transport) => {
    try {
      const hRes = await fetch(makeRequest(req, [transport]), {
        headers: {
          Accept: "text/plain, */*",
        },
        signal,
      });
      if (!hRes.ok) {
        throw new Error(`HTTP ${hRes.status}`);
      }
      return [transport, await parseTextResponse(hRes)];
    } catch {
      return [transport, []];
    }
  })));
}

function makeRequest(req: FchRequest, transports: readonly string[]): string {
  const {
    server = "https://fch.ndn.today",
    count = 1,
    ipv4 = FCH_DEFAULTS.hasIPv4(),
    ipv6 = FCH_DEFAULTS.hasIPv6(),
    position,
  } = req;

  const uri = new URL(server);
  uri.searchParams.set("k", `${count}`);
  for (const c of transports) {
    uri.searchParams.append("cap", c);
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

async function parseJsonResponse(hRes: Response, transports: readonly string[]): Promise<FchResponse> {
  const body = await hRes.json();
  return Object.fromEntries(transports.map((transport) => {
    const routers = body.routers?.[transport];
    return [transport, Array.isArray(routers) ? routers : []];
  }));
}

async function parseTextResponse(hRes: Response): Promise<string[]> {
  const body = await hRes.text();
  return body.split(",").filter((router) => router.length > 0);
}
