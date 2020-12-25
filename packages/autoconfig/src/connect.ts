import { Endpoint } from "@ndn/endpoint";
import { Forwarder, FwFace, TapFace } from "@ndn/fw";
import { Interest, Name } from "@ndn/packet";
import hirestime from "hirestime";

import { createFace } from "./platform_node";

const getNow = hirestime();

async function testConnection(face: FwFace, name: Name = new Name("/localhop/nfd/rib/list")) {
  const tapFace = TapFace.create(face);
  tapFace.addRoute(name);
  const interest = new Interest(name, Interest.CanBePrefix, Interest.Lifetime(1000));
  await new Endpoint({ fw: tapFace.fw }).consume(interest, { describe: "TestConnection" })
    .finally(() => tapFace.close());
}

/** Connect to a router and test the connection. */
export async function connect(host: string, opts: connect.Options = {}): Promise<connect.Result> {
  const {
    testConnection: tc = testConnection,
    addRoutes = [new Name("/")],
  } = opts;
  const face = await createFace(host, opts);

  const testConnectionStart = getNow();
  let testConnectionDuration: number;
  let testConnectionResult: unknown;
  try {
    if (typeof tc === "function") {
      testConnectionResult = await tc(face);
    } else {
      await testConnection(face, tc);
    }
    testConnectionDuration = getNow() - testConnectionStart;
  } catch (err: unknown) {
    face.close();
    throw err;
  }

  for (const routeName of addRoutes) {
    face.addRoute(routeName, false);
  }
  return { face, testConnectionDuration, testConnectionResult };
}

export namespace connect {
  export type PreferProtocol = "udp"|"tcp"|"ws";

  export interface Options {
    fw?: Forwarder;

    /** Prefer one transport protocol over others. */
    preferProtocol?: PreferProtocol;

    /** Override MTU of datagram faces. */
    mtu?: number;

    /** Connect timeout (in milliseconds). */
    connectTimeout?: number;

    /** Test that the face can reach a given name, or provide custom tester function. */
    testConnection?: Name | ((face: FwFace) => Promise<any>);

    /** Routes to be added on the create face. Default is ["/"]. */
    addRoutes?: Name[];
  }

  export interface Result {
    /** Created face */
    face: FwFace;
    /** Execution duration of testConnection function. */
    testConnectionDuration: number;
    /** Return value from custom testConnection function. */
    testConnectionResult: unknown;
  }
}
