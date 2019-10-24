import { Forwarder, FwFace } from "@ndn/fw";
import { L3Face } from "@ndn/l3face";
import { alls, PromiseState } from "alls";

import { createTransport, fetch, overrideOptions } from "./node";

function makeDefaultQueryOptions() {
  return {
    server: "https://ndn-fch.named-data.net",
    count: 1,
    capabilities: [],
    position: null,
  } as queryFch.Options as Required<queryFch.Options>;
}

export async function queryFch(options: queryFch.Options = {}): Promise<string[]> {
  const opts = { ...makeDefaultQueryOptions(), ...options };
  overrideOptions(opts);
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
    server?: string;
    count?: number;
    capabilities?: string[];
    position?: null|[number, number]; // GeoJSON format [lon,lat]
  }
}

function makeDefaultConnectOptions() {
  return {
    fw: Forwarder.getDefault(),
    async testConnection(face: FwFace) {
      return;
    },
  } as connect.Options as Required<connect.Options>;
}

export async function connect(host: string, options: connect.Options): Promise<FwFace> {
  const opts = { ...makeDefaultConnectOptions(), ...options };
  const { fw, testConnection } = opts;
  const transport = await createTransport(host, opts);
  const face = fw.addFace(new L3Face(transport));
  try {
    await testConnection(face);
  } catch (err) {
    face.close();
    throw err;
  }
  return face;
}

export namespace connect {
  export interface Options {
    fw?: Forwarder;
    testConnection?: (face: FwFace) => Promise<void>;
  }
}

export async function connectToTestbed(opts: queryFch.Options&connect.Options = {}): Promise<FwFace[]> {
  const hosts = await queryFch(opts);
  const results = await alls(hosts.map((host) => connect(host, opts)));
  return results.filter(({ state }) => state === PromiseState.fulfilled).map(({ value }) => value);
}
