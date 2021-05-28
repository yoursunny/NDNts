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
    server = "https://fch.ndn.today",
    count = 1,
    transports = FCH_DEFAULTS.transports(),
    ipv4 = FCH_DEFAULTS.hasIPv4(),
    ipv6 = FCH_DEFAULTS.hasIPv6(),
    position,
    signal,
  } = req;

  return Object.fromEntries(await Promise.all(transports.map(async (transport) => {
    const uri = new URL(server);
    uri.searchParams.set("k", `${count}`);
    uri.searchParams.set("cap", transport);
    setBoolParam(uri.searchParams, "ipv4", ipv4);
    setBoolParam(uri.searchParams, "ipv6", ipv6);
    if (position?.length === 2) {
      const [lon, lat] = position;
      uri.searchParams.set("lon", `${lon.toFixed(5)}`);
      uri.searchParams.set("lat", `${lat.toFixed(5)}`);
    }

    try {
      const hRes = await fetch(uri.toString(), {
        headers: {
          Accept: "text/plain",
        },
        signal,
      });
      if (hRes.ok) {
        const body = await hRes.text();
        return [transport, body.split(",").filter((router) => router.length > 0)];
      }
    } catch {}
    return [transport, []];
  })));
}

function setBoolParam(search: URLSearchParams, name: string, value: boolean|undefined): void {
  if (typeof value === "boolean") {
    search.set(name, `${Number(value)}`);
  }
}
