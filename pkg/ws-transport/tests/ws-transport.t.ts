import * as TestReopen from "@ndn/l3face/test-fixture/reopen";
import * as TestTransport from "@ndn/l3face/test-fixture/transport";
import { Closers, delay, pushable } from "@ndn/util";
import { pEvent } from "p-event";
import { beforeEach, expect, test, vi } from "vitest";
import { WebSocket as WsWebSocket } from "ws";

import { WsTransport } from "..";
import { bridgeWebSockets, WsServer } from "../test-fixture/ws-server";

const closers = new Closers();
let server: WsServer;
beforeEach(async () => {
  server = await new WsServer().open();
  closers.push(server);
  return closers.close;
});

async function testPair(convert: (uri: string) => Parameters<typeof WsTransport.connect>[0]) {
  const [tA, tB, sockets] = await Promise.all([
    WsTransport.connect(server.uri),
    WsTransport.connect(convert(server.uri)),
    server.waitNClients(2),
  ]);

  expect(tA.toString()).toBe(`WebSocket(${server.uri})`);

  bridgeWebSockets(sockets);
  TestTransport.check(await TestTransport.execute(tA, tB));
}

test("pair - connect to URI", async () => {
  await testPair((uri) => uri);
});

test("pair - ws WebSocket", async () => {
  await testPair((uri) => new WsWebSocket(uri));
});

test.runIf(globalThis.WebSocket)("pair - native WebSocket", async () => {
  // to run this test case in Node 20, set environ NODE_OPTIONS=--experimental-websocket
  await testPair((uri) => new WebSocket(uri));
});

test("TX throttle", async () => {
  let cws!: WsWebSocket;
  const [transport, socks] = await Promise.all([
    (async () => {
      cws = new WsWebSocket(server.uri);
      await pEvent(cws, "open");
      return WsTransport.connect(cws, { highWaterMark: 2000, lowWaterMark: 1000 });
    })(),
    server.waitNClients(1),
  ]);

  const bufferedAmount = vi.spyOn(cws, "bufferedAmount", "get");

  const sws = socks[0]!;
  sws.binaryType = "nodebuffer";
  const serverRx = vi.fn<(pkt: Uint8Array) => void>();
  sws.on("message", serverRx);

  const clientTx = pushable<Uint8Array>();
  await Promise.all([
    transport.tx(clientTx),
    (async () => {
      bufferedAmount.mockReturnValue(0);
      clientTx.push(Uint8Array.of(0x01));
      await delay(100);
      expect(serverRx).toHaveBeenCalledTimes(1);

      bufferedAmount.mockReturnValue(2500);
      clientTx.push(Uint8Array.of(0x02)); // still sent, because bufferedAmount is read after sending
      await delay(100);
      expect(serverRx).toHaveBeenCalledTimes(2);

      bufferedAmount.mockReturnValue(1500);
      clientTx.push(Uint8Array.of(0x03)); // cannot send until bufferedAmount drops below lowWaterMark
      await delay(100);
      expect(serverRx).toHaveBeenCalledTimes(2);

      bufferedAmount.mockReturnValue(500);
      await delay(100);
      expect(serverRx).toHaveBeenCalledTimes(3);

      clientTx.push(Uint8Array.of(0x04));
      await delay(100);
      expect(serverRx).toHaveBeenCalledTimes(4);

      clientTx.stop();
    })(),
  ]);
});

test("connect error", async () => {
  const { uri } = server;
  await server[Symbol.asyncDispose]();
  await expect(WsTransport.connect(uri, { connectTimeout: 500 })).rejects.toThrow();
});

test("reopen", async () => {
  const transport = await WsTransport.connect(server.uri);
  await TestReopen.run(
    transport,
    server.waitNClients,
    (sock) => sock.close(),
  );
});
