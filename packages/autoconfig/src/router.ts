import { Endpoint } from "@ndn/endpoint";
import { Forwarder, FwFace, TapFace } from "@ndn/fw";
import { Interest, Name } from "@ndn/packet";
import type { H3Transport } from "@ndn/quic-transport";
import hirestime from "hirestime";

import { createFace } from "./platform_node";

export interface ConnectRouterOptions {
  fw?: Forwarder;

  /**
   * Use TCP instead of UDP.
   *
   * This is only relevant in Node.js environment.
   */
  preferTcp?: boolean;

  /**
   * Enable HTTP/3 transport.
   *
   * This is only relevant in browser environment.
   *
   * This should be set to `H3Transport` class instance.
   * It reduces browser bundle size in applications that do not use H3Transport.
   */
  H3Transport?: typeof H3Transport;

  /** Override MTU of datagram faces. */
  mtu?: number;

  /** Connect timeout (in milliseconds). */
  connectTimeout?: number;

  /**
   * Test face connection.
   *
   * If this is a Name or undefined, express an Interest and wait for Data.
   * If this is a function, execute the custom tester function.
   * If this is false, skip connection test.
   */
  testConnection?: Name | ((face: FwFace) => Promise<unknown>) | false;

  /** Routes to be added on the create face. Default is ["/"]. */
  addRoutes?: Name[];
}

export interface ConnectRouterResult {
  /** Created face */
  face: FwFace;
  /** Execution duration of testConnection function. */
  testConnectionDuration: number;
  /** Return value from custom testConnection function. */
  testConnectionResult: unknown;
}

const getNow = hirestime();

/** Connect to a router and test the connection. */
export async function connectToRouter(router: string, opts: ConnectRouterOptions = {}): Promise<ConnectRouterResult> {
  const {
    testConnection: tc = testConnection,
    addRoutes = [new Name("/")],
  } = opts;
  const face = await createFace(router, opts);

  const testConnectionStart = getNow();
  let testConnectionDuration: number;
  let testConnectionResult: unknown;
  try {
    switch (typeof tc) {
      case "function":
        testConnectionResult = await tc(face);
        break;
      case "boolean":
        break;
      default:
        await testConnection(face, tc);
        break;
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

async function testConnection(face: FwFace, name: Name = new Name("/localhop/nfd/rib/list")) {
  const tapFace = TapFace.create(face);
  tapFace.addRoute(name);
  try {
    const interest = new Interest(name, Interest.CanBePrefix, Interest.Lifetime(1000));
    await new Endpoint({ fw: tapFace.fw }).consume(interest, { describe: "TestConnection" });
  } finally {
    tapFace.close();
  }
}
