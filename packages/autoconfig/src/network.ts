import { FwFace } from "@ndn/fw";

import { type FchRequest, fchQuery } from "./fch";
import { FCH_DEFAULTS, getDefaultGateway } from "./platform_node";
import { type ConnectRouterOptions, type ConnectRouterResult, connectToRouter } from "./router";

export interface ConnectNetworkOptions extends ConnectRouterOptions {
  /**
   * FCH request.
   *
   * Default is requesting 4 routers.
   * Pass false to disable FCH.
   */
  fch?: FchRequest | false;

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

  const connected: ConnectRouterResult[] = [];
  const errors: string[] = [];
  for await (const routers of
    (async function*(): AsyncIterable<string[]> {
      const routers: string[] = [];
      if (fch !== false) {
        fch.transports ??= FCH_DEFAULTS.transports(opts);
        const res = await fchQuery(fch);

        const h3routers: string[] = [];
        for (const r of res.routers) {
          (preferH3 && r.transport === "http3" ? h3routers : routers).push(r.connect);
        }
        yield h3routers;
      }
      if (tryDefaultGateway) {
        try { routers.unshift(await getDefaultGateway()); } catch {}
      }
      yield routers;
      yield fallback;
    })()
  ) {
    await Promise.all(routers.map(async (router) => {
      try {
        connected.push(await connectToRouter(router, opts));
      } catch (err: unknown) {
        errors.push(`  ${router} ${err}`);
      }
    }));
    if (connected.length > 0) {
      break;
    }
  }

  if (connected.length === 0) {
    throw new Error(`connect to network failed\n${errors.join("\n")}`);
  }

  connected.sort((a, b) => a.testConnectionDuration - b.testConnectionDuration);
  for (const { face } of connected.splice(fastest, Infinity)) {
    face.close();
  }
  return connected.map(({ face }) => face);
}
