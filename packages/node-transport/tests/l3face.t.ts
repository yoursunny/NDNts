import type * as net from "node:net";

import { Forwarder, FwPacket } from "@ndn/fw";
import { L3Face } from "@ndn/l3face";
import { Interest } from "@ndn/packet";
import { delay } from "@ndn/util";
import { collect } from "streaming-iterables";
import { beforeEach, expect, test, vi } from "vitest";

import { UnixTransport } from "..";
import { BufferBreaker } from "../test-fixture/buffer-breaker";
import { IpcServer } from "../test-fixture/net-server";

let server: IpcServer;
let sock: net.Socket;
let face: L3Face;

beforeEach(async () => {
  server = new IpcServer();
  await server.open();
  const [transport, socks] = await Promise.all([
    UnixTransport.connect(server.path),
    server.waitNClients(1),
  ]);
  face = new L3Face(transport);
  sock = socks[0]!;
  return async () => { await server.close(); };
});

test("RX error", async () => {
  const handleRxError = vi.fn<[CustomEvent<L3Face.RxError>], void>();
  face.addEventListener("rxerror", handleRxError, { once: true });

  setTimeout(() => sock.write(Uint8Array.of(0xF0, 0x00)), 200);
  await Promise.all([
    expect(collect(face.rx)).resolves.toHaveLength(0),
    face.tx((async function*() { // eslint-disable-line require-yield
      await delay(400);
    })()),
  ]);

  expect(handleRxError).toHaveBeenCalledOnce();
  expect(handleRxError.mock.calls[0]![0]!.detail.message).toContain("F000");
});

test("createFace", async () => {
  const fw = Forwarder.create();
  const [face2, [sock0, sock1]] = await Promise.all([
    UnixTransport.createFace({ fw, addRoutes: ["/Q"] }, server.path),
    server.waitNClients(2),
  ]);
  expect(face2.attributes.advertiseFrom).toBe(false);
  expect(face2.hasRoute("/")).toBeFalsy();
  expect(face2.hasRoute("/Q")).toBeTruthy();
  BufferBreaker.duplex(sock0!, sock1!);

  const rx = vi.fn();
  fw.addEventListener("pktrx", rx);
  await Promise.all([
    delay(100),
    face.tx((async function*() {
      yield FwPacket.create(new Interest("/Z", Interest.Lifetime(50)));
    })()),
  ]);
  expect(rx).toHaveBeenCalledTimes(1);
  face2.close();
});
