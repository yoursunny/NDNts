import { FwFace } from "@ndn/fw";

import { connect } from "./connect";
import { queryFch } from "./fch";
import { getDefaultGateway } from "./platform";

interface Options {
  /** Maximum number of faces to establish. */
  count: number;
  /** Consider default IPv4 gateway as a candidate. */
  tryDefaultGateway: boolean;
  /** Choose one face with fastest testConnection completion and close others. */
  preferFastest: boolean;
}

function makeDefaultOptions() {
  return {
    count: 1,
    tryDefaultGateway: true,
    preferFastest: false,
  } as Options;
}

export async function connectToTestbed(options: Partial<connectToTestbed.Options> = {}): Promise<FwFace[]> {
  const opts = { ...makeDefaultOptions(), ...options };
  const hosts = await queryFch(opts);
  if (opts.tryDefaultGateway) {
    try { hosts.unshift(await getDefaultGateway()); } catch (err) {}
  }
  const faces = [] as connect.Result[];
  for (const host of hosts) {
    try { faces.push(await connect(host, options)); } catch (err) {}
    if (faces.length >= opts.count) {
      break;
    }
  }
  if (opts.preferFastest && faces.length > 1) {
    faces.sort(({ testConnectionDuration: d1 }, { testConnectionDuration: d2 }) => d1 - d2);
    for (const {face} of faces.splice(1)) {
      face.close();
    }
  }
  return faces.map(({face}) => face);
}

type Options_ = Options;

export namespace connectToTestbed {
  export type Options = queryFch.Options&connect.Options&Options_;
}
