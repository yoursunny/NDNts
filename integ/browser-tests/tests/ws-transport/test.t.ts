import "./api";

import * as TestTransport from "@ndn/l3face/test-fixture/transport";
import { WsServerPair } from "@ndn/ws-transport/test-fixture";

import { getPageUri, pageInvoke } from "../../test-fixture";

let wssPair: WsServerPair;
let wsUri: string;

beforeAll(async () => {
  wssPair = new WsServerPair();
  wsUri = await wssPair.listen();
});

afterAll(async () => {
  await wssPair.close();
});

beforeEach(() => page.goto(getPageUri(__dirname)));

test("pair", async () => {
  const result = await pageInvoke<typeof window.testWsTransportPair>(page, "testWsTransportPair", wsUri);
  TestTransport.check(result);
});
