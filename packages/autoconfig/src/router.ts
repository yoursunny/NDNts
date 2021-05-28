import { Endpoint } from "@ndn/endpoint";
import { Forwarder, FwFace, TapFace } from "@ndn/fw";
import { Interest, Name } from "@ndn/packet";
import type { H3Transport } from "@ndn/quic-transport";
import hirestime from "hirestime";
import pAny from "p-any";

import { createFace } from "./platform_node";

type TestConnectionPacket = string | Name | Interest;

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
   * - false: skip test.
   * - string or Name or Interest or array: express Interest(s) and wait for any Data.
   *   If string ends with "/*", it's replaced with a random component.
   * - function: execute the custom tester function.
   *
   * Default is "/localhop/nfd/rib/list".
   */
  testConnection?: false | TestConnectionPacket | TestConnectionPacket[] |
  ((face: FwFace) => Promise<unknown>);

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
    testConnection: tc,
    addRoutes = [new Name("/")],
  } = opts;
  const face = await createFace(router, opts);

  const testConnectionStart = getNow();
  let testConnectionDuration: number;
  let testConnectionResult: unknown;
  try {
    testConnectionResult = await testConnection(face, tc);
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

async function testConnection(
    face: FwFace,
    tc: ConnectRouterOptions["testConnection"] = new Name("/localhop/nfd/rib/list"),
): Promise<unknown> {
  if (tc === false) {
    return undefined;
  }
  if (typeof tc === "function") {
    return tc(face);
  }
  if (!Array.isArray(tc)) {
    tc = [tc];
  }

  const tapFace = TapFace.create(face);
  tapFace.addRoute(new Name());
  const abort = new AbortController();
  try {
    const endpoint = new Endpoint({ fw: tapFace.fw, signal: abort.signal });
    await pAny(tc.map((pkt) => {
      if (typeof pkt === "string") {
        pkt = pkt.endsWith("/*") ?
          new Name(pkt.slice(0, -2)).append(Math.floor(Math.random() * 1e8).toString().padStart(8, "0")) :
          pkt;
      }
      const interest = pkt instanceof Interest ? pkt : new Interest(pkt, Interest.CanBePrefix);
      return endpoint.consume(interest);
    }));
  } finally {
    abort.abort();
    tapFace.close();
  }
  return undefined;
}
