import { FwFace } from "@ndn/fw";
import { collect, filter, pipeline, transform } from "streaming-iterables";

import { fchQuery, FchRequest } from "./fch";
import { FCH_DEFAULTS, getDefaultGateway } from "./platform_node";
import { ConnectRouterOptions, ConnectRouterResult, connectToRouter } from "./router";

export interface ConnectNetworkOptions extends ConnectRouterOptions {
  /**
   * FCH request.
   *
   * Default is requesting 4 routers.
   * Pass false to disable FCH.
   */
  fch?: FchRequest|false;

  /**
   * Whether to try HTTP/3 before all other options.
   * Default is false.
   * Ignored if H3Transport is not enabled or supported.
   */
  preferH3?: boolean;

  /** Consider default IPv4 gateway as a candidate. */
  tryDefaultGateway?: boolean;

  /** Fallback routers, used if FCH and default gateway are both unavailable. */
  fallback?: string[];

  /**
   * Number of faces to keep; others are closed.
   * Faces are ranked by shortest testConnection duration.
   * Default is 1.
   */
  fastest?: number;
}

/** Connect to an NDN network. */
export async function connectToNetwork(opts: ConnectNetworkOptions = {}): Promise<FwFace[]> {
  const {
    fch = { count: 4 },
    preferH3 = false,
    tryDefaultGateway = true,
    fallback = [],
    fastest = 1,
  } = opts;

  let connected: ConnectRouterResult[] = [];
  for await (const routers of
    (async function*(): AsyncIterable<string[]> {
      const routers = [];
      if (fch !== false) {
        if (!fch.transports) {
          fch.transports = FCH_DEFAULTS.transports(opts);
        }
        const res = await fchQuery(fch);

        if (preferH3) {
          const { http3 = [] } = res;
          if (http3.length > 0) {
            yield http3;
          }
          delete res.http3;
        }

        for (const list of Object.values(res)) {
          routers.push(...list);
        }
      }
      if (tryDefaultGateway) {
        try { routers.unshift(await getDefaultGateway()); } catch {}
      }
      yield routers;
      yield fallback;
    })()
  ) {
    connected = await pipeline(
      () => routers,
      transform(Infinity, (router) => connectToRouter(router, opts).catch(() => undefined)),
      filter((res): res is ConnectRouterResult => !!res),
      collect,
    );
    if (connected.length > 0) {
      break;
    }
  }

  if (connected.length === 0) {
    throw new Error("connect to network failed");
  }

  connected.sort((a, b) => a.testConnectionDuration - b.testConnectionDuration);
  for (const { face } of connected.splice(fastest, Infinity)) {
    face.close();
  }
  return connected.map(({ face }) => face);
}
