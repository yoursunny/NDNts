import * as TestTransport from "@ndn/llface/test-fixture/transport";

import { WsTransport } from "../src";
import { WsServerPair } from "../test-fixture";

test("pair", async () => {
  const wssPair = new WsServerPair();
  const uri = await wssPair.listen();
  const [transportA, transportB] = await Promise.all([
    WsTransport.connect(uri),
    WsTransport.connect(uri),
  ]);
  expect(transportA).toBeInstanceOf(WsTransport);
  expect(transportB).toBeInstanceOf(WsTransport);
  await wssPair.waitPaired();
  TestTransport.check(await TestTransport.execute(transportA, transportB));
  await wssPair.close();
});
