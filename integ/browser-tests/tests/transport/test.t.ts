import "./api";

import * as TestTransport from "@ndn/l3face/test-fixture/transport";
import { bridgeSessions, WtServer } from "@ndn/quic-transport/test-fixture/wt-server";
import { Closers, toHex } from "@ndn/util";
import { bridgeWebSockets, WsServer } from "@ndn/ws-transport/test-fixture/ws-server";
import { beforeEach, test } from "vitest";

import { navigateToPage, pageInvoke } from "../../test-fixture/pptr";

const closers = new Closers();
beforeEach(async () => {
  await navigateToPage(import.meta);
  return closers.close;
});

test("WebSocket pair", async () => {
  const server = await WsServer.create();
  closers.push(server);

  await pageInvoke<typeof globalThis.connectWsTransportPair>("connectWsTransportPair", server.uri);
  const sockets = await server.waitNClients(2);
  bridgeWebSockets(sockets);

  const result = await pageInvoke<typeof globalThis.testWsTransportPair>("testWsTransportPair");
  TestTransport.check(result);
});

test("HTTP/3 pair", async () => {
  const server = await WtServer.create();
  closers.push(server);

  await pageInvoke<typeof globalThis.connectH3TransportPair>("connectH3TransportPair", server.uri, toHex(server.certHash));
  const sessions = await server.waitNClients(2);
  bridgeSessions(sessions);

  const result = await pageInvoke<typeof globalThis.testH3TransportPair>("testH3TransportPair");
  TestTransport.check(result);
});
