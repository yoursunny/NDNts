import "./api";

import * as TestTransport from "@ndn/l3face/test-fixture/transport";
import { Closers } from "@ndn/util";
import { bridgeWebSockets, WsServer } from "@ndn/ws-transport/test-fixture/ws-server";
import { beforeEach, test } from "vitest";

import { navigateToPage, pageInvoke } from "../../test-fixture/pptr";

const closers = new Closers();
let server: WsServer;
beforeEach(async () => {
  server = await new WsServer().open();
  closers.push(server);
  await navigateToPage(import.meta.url);
  return closers.close;
});

test("pair", async () => {
  await pageInvoke<typeof window.connectWsTransportPair>("connectWsTransportPair", server.uri);
  const sockets = await server.waitNClients(2);
  bridgeWebSockets(sockets);

  const result = await pageInvoke<typeof window.testWsTransportPair>("testWsTransportPair");
  TestTransport.check(result);
});
