import { Interest } from "@ndn/l3pkt";
import { LLFace } from "@ndn/llface";
import * as TestTransport from "@ndn/llface/test-fixture/transport";
import * as rPromise from "remote-controlled-promise";
import * as echoServer from "websocket-stream/echo-server";

import { WsTransport } from "../src";
import { WsServerPair } from "../test-fixture";

const ECHO_SERVER = echoServer.url;

test("echo", async () => {
  echoServer.start({});

  const done = rPromise.create();
  const transport = await WsTransport.connect(ECHO_SERVER);
  const face = new LLFace(transport);

  process.nextTick(() => {
    face.sendInterest(new Interest("/A"));
  });

  face.recvInterest.add((interest) => {
    expect(interest.name.toString()).toBe("/A");
    face.close();
    done.resolve(undefined);
  });

  await done.promise;
  echoServer.stop();
});

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
