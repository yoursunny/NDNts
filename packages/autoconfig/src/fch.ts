import { FCH_ALWAYS_CAPABILITIES, fetch } from "./platform/mod";

export async function queryFch(opts: queryFch.Options = {}): Promise<string[]> {
  const {
    server = "https://ndn-fch.named-data.net",
    count = 1,
    capabilities = [],
    position = queryFch.IpGeolocation,
  } = opts;

  let u = `${server.replace(/\/$/, "")}/?k=${count}`;
  for (const cap of new Set([...capabilities, ...FCH_ALWAYS_CAPABILITIES])) {
    u += `&cap=${cap}`;
  }
  if (position !== queryFch.IpGeolocation) {
    u += `&lon=${position[0].toFixed(5)}&lat=${position[1].toFixed(5)}`;
  }

  const resp = await fetch(u);
  if (!resp.ok) {
    throw new Error(`invalid NDN-FCH HTTP response ${resp.status}`);
  }
  const text = await resp.text();
  return text.split(",");
}

export namespace queryFch {
  export interface Options {
    /** FCH server, must be https for browser. */
    server?: string;
    /** Number of routers to request, default is 1. */
    count?: number;
    /** Required router capabilities. */
    capabilities?: string[];
    /** GPS position in GeoJSON [lon,lat] format, or IpGeolocation. */
    position?: [number, number] | typeof IpGeolocation;
  }

  /** Set IP geolocation in Options.position. */
  export const IpGeolocation = Symbol("queryFch.IpGeolocation");
}
