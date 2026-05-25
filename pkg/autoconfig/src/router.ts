import { consume, type ConsumerOptions } from "@ndn/endpoint";
import { type Forwarder, type FwFace, TapFace } from "@ndn/fw";
import { Interest, Name, type NameLike } from "@ndn/packet";
import type { H3Transport } from "@ndn/quic-transport";
import { assert } from "@ndn/util";
import { pEvent } from "p-event";
import type { Arrayable } from "type-fest";

import { createFace } from "./platform_node";

type TestConnectionPacket = string | Name | Interest;

/** {@link connectToRouter} options. */
export interface ConnectRouterOptions {
  /**
   * Logical forwarder to attach faces to.
   * @defaultValue `Forwarder.getDefault()`
   */
  fw?: Forwarder;

  /**
   * Use TCP instead of UDP.
   *
   * @remarks
   * This is only relevant in Node.js environment.
   */
  preferTcp?: boolean;

  /**
   * Enable HTTP/3 transport.
   *
   * @remarks
   * This is only relevant in browser environment.
   *
   * This should be set to {@link H3Transport} class instance. Having this option avoids always
   * pulling in H3Transport code, to reduce browser bundle size in applications that do not use it.
   */
  H3Transport?: typeof H3Transport;

  /** Override MTU of datagram faces. */
  mtu?: number;

  /** Connect timeout (in milliseconds). */
  connectTimeout?: number;

  /**
   * Test face connection.
   * @defaultValue "/localhop/nfd/rib/list"
   *
   * @remarks
   * - false: skip test.
   * - string or Name or Interest or array: express Interest(s) and wait for first Data reply.
   *   If string ends with "/*", it's replaced with a random component.
   * - function: execute the custom tester function.
   */
  testConnection?: false | Arrayable<TestConnectionPacket> |
    ((face: FwFace) => Promise<unknown>);

  /**
   * InterestLifetime of connection test Interest packets.
   * @defaultValue 2000
   *
   * @remarks
   * Used only if testConnection is a string or Name.
   */
  testConnectionTimeout?: number;

  /**
   * Routes to be added on the created face.
   * @defaultValue `["/"]`
   */
  addRoutes?: readonly NameLike[];

  /** AbortSignal that allows canceling the attempt via AbortController. */
  signal?: AbortSignal;
}

/** {@link connectToRouter} result. */
export interface ConnectRouterResult {
  /** Input router string. */
  router: string;
  /** Created face */
  face: FwFace;
  /** Execution duration of testConnection function (in milliseconds). */
  testConnectionDuration: number;
  /** Return value from custom testConnection function. */
  testConnectionResult: unknown;
}

/** Connect to a router and test the connection. */
export async function connectToRouter(router: string, opts: ConnectRouterOptions = {}): Promise<ConnectRouterResult> {
  const { signal } = opts;
  let face: FwFace | undefined;
  const promises: Array<Promise<void>> = [
    (async () => {
      // createFace does not take AbortSignal, but clear it to protect against future changes
      face = await createFace(router, { ...opts, signal: undefined });
    })(),
  ];
  if (signal) {
    promises.push((async () => {
      if (!signal.aborted) {
        await pEvent(signal, "abort");
      }
    })());
  }
  await Promise.race(promises);
  if (!face) {
    assert(signal?.aborted);
    throw signal.reason; // eslint-disable-line @typescript-eslint/only-throw-error
  }

  const testConnectionStart = performance.now();
  let testConnectionDuration: number;
  let testConnectionResult: unknown;
  try {
    testConnectionResult = await testConnection(face, opts);
    testConnectionDuration = performance.now() - testConnectionStart;
    signal?.throwIfAborted();
  } catch (err: unknown) {
    face.close();
    throw err;
  }
  return { router, face, testConnectionDuration, testConnectionResult };
}

async function testConnection(
    face: FwFace,
    {
      testConnection: tc = new Name("/localhop/nfd/rib/list"),
      testConnectionTimeout = 2000,
      signal: parentSignal,
    }: ConnectRouterOptions,
): Promise<unknown> {
  parentSignal?.throwIfAborted();

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
  tapFace.addRoute("/");
  const raceAbort = new AbortController();
  const cOpts: ConsumerOptions = {
    fw: tapFace.fw,
    signal: parentSignal ? AbortSignal.any([parentSignal, raceAbort.signal]) : raceAbort.signal,
  };
  try {
    return await Promise.any(tc.map(async (pkt, i) => {
      if (typeof pkt === "string" && pkt.endsWith("/*")) {
        pkt = new Name(pkt.slice(0, -2)).append(Math.trunc(Math.random() * 1e8).toString().padStart(8, "0"));
      }
      const interest = pkt instanceof Interest ? pkt :
        new Interest(pkt, Interest.CanBePrefix, Interest.Lifetime(testConnectionTimeout));
      const data = await consume(interest, cOpts);
      return { i, interest, data };
    }));
  } finally {
    raceAbort.abort();
    tapFace.close();
  }
}
