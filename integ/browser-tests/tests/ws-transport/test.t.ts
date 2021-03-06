import "./api";

import * as TestTransport from "@ndn/l3face/test-fixture/transport";
import { bridgeWebSockets, WsServer } from "@ndn/ws-transport/test-fixture/ws-server";

import { navigateToPage, pageInvoke } from "../../test-fixture/pptr";

let server: WsServer;

beforeEach(async () => {
  server = new WsServer();
  await server.open();
  await navigateToPage(__dirname);
});

afterEach(() => server.close());

test("pair", async () => {
  await pageInvoke<typeof window.connectWsTransportPair>(page, "connectWsTransportPair", server.uri);
  const sockets = await server.waitNClients(2);
  bridgeWebSockets(sockets);

  const result = await pageInvoke<typeof window.testWsTransportPair>(page, "testWsTransportPair");
  TestTransport.check(result);
});
