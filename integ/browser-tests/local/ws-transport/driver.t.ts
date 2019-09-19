import * as TestTransport from "@ndn/llface/test-fixture/transport";
import { WsServerPair } from "@ndn/ws-transport/test-fixture";

import { DevHttpServer } from "../../test-fixture";

import { Args, Result } from "./types";

beforeAll(async () => {
  await DevHttpServer.start(__dirname, "..");
});

afterAll(async () => {
  await DevHttpServer.stop();
});

test("pair", async () => {
  const wssPair = new WsServerPair();
  const wsUri = await wssPair.listen();

  await driver.get(DevHttpServer.getUri("ws-transport/index.html"));
  const result: Result|string = await driver.executeAsyncScript(
    "window.main.apply(undefined,arguments)",
    { wsUri } as Args);

  expect(result).not.toEqual(expect.any(String));
  if (typeof result === "object") {
    TestTransport.check(result);
  }
  await wssPair.close();
}, 30000);
