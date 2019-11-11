import * as TestTransport from "@ndn/l3face/test-fixture/transport";

import { WsTransport } from "..";
import * as WsTest from "../test-fixture/wss";

beforeEach(WsTest.createServer);

afterEach(WsTest.destroyServer);

test("pair", async () => {
  const [transportA, transportB] = await Promise.all([
    WsTransport.connect(WsTest.uri),
    WsTransport.connect(WsTest.uri),
    WsTest.waitNClients(2),
  ]);
  WsTest.enableBroadcast();
  expect(transportA.toString()).toBe(`WebSocket(${WsTest.uri})`);
  TestTransport.check(await TestTransport.execute(transportA, transportB, (t) => t.close()));
});
