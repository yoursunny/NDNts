import type { FwFace } from "@ndn/fw";

import { fchQuery, type FchRequest } from "./fch";
import { FCH_DEFAULTS, getDefaultGateway } from "./platform_node";
import { type ConnectRouterOptions, type ConnectRouterResult, connectToRouter } from "./router";

/** {@link connectToNetwork} options. */
export interface ConnectNetworkOptions extends ConnectRouterOptions {
  /**
   * FCH request, or `false` to disable FCH query.
   * @defaultValue `{ count: 4 }`
   */
  fch?: FchRequest | false;

  /**
   * Whether to try HTTP/3 before all other options.
   * @defaultValue false
   *
   * @remarks
   * Ignored if H3Transport is not enabled or supported.
   */
  preferH3?: boolean;

  /**
   * Whether to consider default IPv4 gateway as a candidate.
   * @defaultValue true
   *
   * @remarks
   * This option has no effect if IPv4 gateway cannot be determined, e.g. in browser.
   */
  tryDefaultGateway?: boolean;

  /** Fallback routers, used if FCH and default gateway are both unavailable. */
  fallback?: readonly string[];

  /**
   * Number of faces to keep; others are closed.
   * Faces are ranked by shortest testConnection duration.
   * @defaultValue 1
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
  const errs: Record<string, unknown> = {};
  for await (const routers of
    (async function*(): AsyncIterable<readonly string[]> {
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
        errs[router] = err;
      }
    }));
    if (connected.length > 0) {
      break;
    }
  }

  if (connected.length === 0) {
    const errorMsgs = Object.entries(errs).map(([router, err]) => `  ${router} ${err}`);
    throw new AggregateError(
      Object.values(errs),
      `connect to network failed\n${errorMsgs.join("\n")}`,
    );
  }

  connected.sort((a, b) => a.testConnectionDuration - b.testConnectionDuration);
  for (const { face } of connected.splice(fastest)) {
    face.close();
  }
  return connected.map(({ face }) => face);
}
