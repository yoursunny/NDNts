import { FwFace } from "@ndn/fw";
import { collect, filter, pipeline, transform } from "streaming-iterables";

import { connect, queryFch } from "./mod";
import { getDefaultGateway } from "./platform/mod";

interface Options {
  /** List of routers to use in case FCH request fails. */
  fchFallback?: string[];
  /** Maximum number of faces to establish. */
  count?: number;
  /** Consider default IPv4 gateway as a candidate. */
  tryDefaultGateway?: boolean;
  /** Choose one face with fastest testConnection completion and close others. */
  preferFastest?: boolean;
}

export async function connectToTestbed(opts: connectToTestbed.Options = {}): Promise<FwFace[]> {
  const {
    fchFallback = [],
    tryDefaultGateway = true,
    preferFastest = false,
  } = opts;
  const hosts = await queryFch(opts).catch(() => fchFallback);
  if (tryDefaultGateway) {
    try { hosts.unshift(await getDefaultGateway()); } catch {}
  }
  const faces = await pipeline(
    () => hosts,
    transform(Infinity, (host) => connect(host, opts).catch(() => undefined)),
    filter((res): res is connect.Result => !!res),
    collect,
  );
  if (preferFastest && faces.length > 1) {
    faces.sort(({ testConnectionDuration: d1 }, { testConnectionDuration: d2 }) => d1 - d2);
    for (const { face } of faces.splice(1)) {
      face.close();
    }
  }
  return faces.map(({ face }) => face);
}

type Options_ = Options;

export namespace connectToTestbed {
  export type Options = queryFch.Options&connect.Options&Options_;
}
