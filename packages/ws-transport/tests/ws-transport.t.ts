import { L3Face } from "@ndn/l3face";
import * as TestTransport from "@ndn/l3face/test-fixture/transport";
import { Interest } from "@ndn/l3pkt";
import pushable from "it-pushable";

import { WsTransport } from "..";
import * as WsTest from "../test-fixture/wss";

beforeEach(WsTest.createServer);

afterEach(WsTest.destroyServer);

test("pair", async () => {
  const [tA, tB] = await Promise.all([
    WsTransport.connect(WsTest.uri),
    WsTransport.connect(WsTest.uri),
    WsTest.waitNClients(2),
  ]);
  WsTest.enableBroadcast();
  expect(tA.toString()).toBe(`WebSocket(${WsTest.uri})`);
  TestTransport.check(await TestTransport.execute(tA, tB));
});

test("TX throttle", async () => {
  const [transport, [sws]] = await Promise.all([
    WsTransport.connect(WsTest.uri, { highWaterMark: 2000, lowWaterMark: 1000 }),
    WsTest.waitNClients(1),
  ]);

  const cws = (transport as any).sock as WebSocket;
  const bufferedAmount = jest.spyOn(cws, "bufferedAmount", "get");

  sws.binaryType = "nodebuffer";
  const serverRx = jest.fn<void, [Uint8Array]>();
  sws.on("message", serverRx);

  const clientTx = pushable<Uint8Array>();
  await Promise.all([
    transport.tx(clientTx),
    (async () => {
      bufferedAmount.mockReturnValue(0);
      clientTx.push(Uint8Array.of(0x01));
      await new Promise((r) => setTimeout(r, 100));
      expect(serverRx).toHaveBeenCalledTimes(1);

      bufferedAmount.mockReturnValue(2500);
      clientTx.push(Uint8Array.of(0x02)); // still sent, because bufferedAmount is read after sending
      await new Promise((r) => setTimeout(r, 100));
      expect(serverRx).toHaveBeenCalledTimes(2);

      bufferedAmount.mockReturnValue(1500);
      clientTx.push(Uint8Array.of(0x03)); // cannot send until bufferedAmount drops below lowWaterMark
      await new Promise((r) => setTimeout(r, 100));
      expect(serverRx).toHaveBeenCalledTimes(2);

      bufferedAmount.mockReturnValue(500);
      await new Promise((r) => setTimeout(r, 100));
      expect(serverRx).toHaveBeenCalledTimes(3);

      clientTx.push(Uint8Array.of(0x04));
      await new Promise((r) => setTimeout(r, 100));
      expect(serverRx).toHaveBeenCalledTimes(4);

      clientTx.end();
    })(),
  ]);
});

test("connect error", async () => {
  const uri = WsTest.uri;
  WsTest.destroyServer();
  await expect(WsTransport.connect(uri)).rejects.toThrow();
});

test("reopen", async () => {
  const [transport, [sws]] = await Promise.all([
    WsTransport.connect(WsTest.uri, { highWaterMark: 2000, lowWaterMark: 1000 }),
    WsTest.waitNClients(1),
  ]);
  const face = new L3Face(transport);

  const stateEvt = jest.fn<void, [L3Face.State]>();
  face.on("state", stateEvt);
  const upEvt = jest.fn();
  face.on("up", upEvt);
  const downEvt = jest.fn();
  face.on("down", downEvt);
  const closeEvt = jest.fn();
  face.on("close", closeEvt);

  let end = false;
  face.tx((async function*() {
    while (!end) {
      yield new Interest("/A");
      await new Promise((r) => setTimeout(r, 20));
    }
  })());

  await new Promise((r) => setTimeout(r, 100));
  sws.close();
  await new Promise((r) => setTimeout(r, 50));
  expect(WsTest.wss.clients.size).toBe(0);

  expect(downEvt).toHaveBeenCalledTimes(1);
  expect(stateEvt).toHaveBeenCalledTimes(1);
  expect(stateEvt).toHaveBeenLastCalledWith(L3Face.State.DOWN);

  await WsTest.waitNClients(1);
  await new Promise((r) => setTimeout(r, 50));

  expect(upEvt).toHaveBeenCalledTimes(1);
  expect(stateEvt).toHaveBeenCalledTimes(2);
  expect(stateEvt).toHaveBeenLastCalledWith(L3Face.State.UP);

  end = true;
  await new Promise((r) => setTimeout(r, 50));

  expect(closeEvt).toHaveBeenCalledTimes(1);
  expect(stateEvt).toHaveBeenCalledTimes(3);
  expect(stateEvt).toHaveBeenLastCalledWith(L3Face.State.CLOSED);
  expect(WsTest.wss.clients.size).toBe(0);
});
