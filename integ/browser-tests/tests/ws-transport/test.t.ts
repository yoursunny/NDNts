import "./api";

import * as TestTransport from "@ndn/l3face/test-fixture/transport";
import * as WsTest from "@ndn/ws-transport/test-fixture/wss";

import { getPageUri, pageInvoke } from "../../test-fixture";

beforeEach(() => Promise.all([
  WsTest.createServer(),
  page.goto(getPageUri(__dirname)),
]));

afterEach(WsTest.destroyServer);

test("pair", async () => {
  await pageInvoke<typeof window.connectWsTransportPair>(page, "connectWsTransportPair", WsTest.uri);
  await WsTest.waitNClients(2);
  WsTest.enableBroadcast();
  const result = await pageInvoke<typeof window.testWsTransportPair>(page, "testWsTransportPair");
  TestTransport.check(result);
});
