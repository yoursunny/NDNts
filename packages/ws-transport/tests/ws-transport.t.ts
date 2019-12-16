import * as TestReopen from "@ndn/l3face/test-fixture/reopen";
import * as TestTransport from "@ndn/l3face/test-fixture/transport";
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
  await expect(WsTransport.connect(uri, { connectTimeout: 500 })).rejects.toThrow();
});

test("reopen", async () => {
  const transport = await WsTransport.connect(WsTest.uri);
  await TestReopen.run(
    transport,
    WsTest.waitNClients,
    (sock) => sock.close(),
  );
});
