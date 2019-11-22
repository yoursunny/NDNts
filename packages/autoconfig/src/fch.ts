import { fetch, overrideFchOptions } from "./platform/mod";

function makeDefaultOptions() {
  return {
    server: "https://ndn-fch.named-data.net",
    count: 1,
    capabilities: [],
    position: null,
  } as queryFch.Options;
}

export async function queryFch(options: Partial<queryFch.Options> = {}): Promise<string[]> {
  const opts = { ...makeDefaultOptions(), ...options };
  overrideFchOptions(opts);
  const { server, count, capabilities: cap, position } = opts;

  let u = `${server.replace(/[/]$/, "")}/?k=${count}`;
  if (cap.length > 0) {
    u += `&cap=${cap.join()}`;
  }
  if (position) {
    u += `&lon=${position[0]}&lat=${position[1]}`;
  }

  const resp = await fetch(u);
  const text = await resp.text();
  return text.split(",");
}

export namespace queryFch {
  export interface Options {
    /** FCH server, must be https for browser. */
    server: string;
    /** Number of routers to request. */
    count: number;
    /** Required router capabilities. */
    capabilities: string[];
    /** GPS position in GeoJSON [lon,lat] format, or null to use IP geolocation. */
    position: null|[number, number];
  }
}
