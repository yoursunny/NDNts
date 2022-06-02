import * as TestReopen from "@ndn/l3face/test-fixture/reopen";
import * as TestTransport from "@ndn/l3face/test-fixture/transport";
import { delay } from "@ndn/util";
import { pushable } from "it-pushable";
import { beforeEach, expect, test, vi } from "vitest";
import type WebSocket from "ws";

import { WsTransport } from "..";
import { bridgeWebSockets, WsServer } from "../test-fixture/ws-server";

let server: WsServer;
beforeEach(async () => {
  server = new WsServer();
  await server.open();
  return async () => { await server.close(); };
});

test("pair", async () => {
  const [tA, tB, sockets] = await Promise.all([
    WsTransport.connect(server.uri),
    WsTransport.connect(server.uri),
    server.waitNClients(2),
  ]);

  expect(tA.toString()).toBe(`WebSocket(${server.uri})`);

  bridgeWebSockets(sockets);
  TestTransport.check(await TestTransport.execute(tA, tB));
});

test("TX throttle", async () => {
  const [transport, socks] = await Promise.all([
    WsTransport.connect(server.uri, { highWaterMark: 2000, lowWaterMark: 1000 }),
    server.waitNClients(1),
  ]);

  const cws = (transport as any).sock as WebSocket;
  const bufferedAmount = vi.spyOn(cws, "bufferedAmount", "get");

  const sws = socks[0]!;
  sws.binaryType = "nodebuffer";
  const serverRx = vi.fn<[Uint8Array], void>();
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

      clientTx.end();
    })(),
  ]);
});

test("connect error", async () => {
  const uri = server.uri;
  await server.close();
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
