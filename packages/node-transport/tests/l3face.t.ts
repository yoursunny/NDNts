import "@ndn/packet/test-fixture/expect";

import type * as net from "node:net";

import { Forwarder, FwPacket } from "@ndn/fw";
import { L3Face } from "@ndn/l3face";
import { Data, Interest } from "@ndn/packet";
import { asDataView, Closers, delay } from "@ndn/util";
import { collect } from "streaming-iterables";
import { beforeEach, expect, test, vi } from "vitest";

import { UnixTransport } from "..";
import { BufferBreaker } from "../test-fixture/buffer-breaker";
import { IpcServer } from "../test-fixture/net-server";

const closers = new Closers();
let server: IpcServer;
let sock: net.Socket;
let face: L3Face;

beforeEach(async () => {
  server = await new IpcServer().open();
  closers.push(server);
  const [transport, socks] = await Promise.all([
    UnixTransport.connect(server.path),
    server.waitNClients(1),
  ]);
  face = new L3Face(transport);
  sock = socks[0]!;
  return closers.close;
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
  expect(handleRxError.mock.calls[0]![0].detail.message).toContain("F000");
});

test("createFace", async () => {
  const fw = Forwarder.create();
  const [face2, [sock0, sock1]] = await Promise.all([
    UnixTransport.createFace({ fw, addRoutes: ["/Q"] }, server.path),
    server.waitNClients(2),
  ]);
  closers.push(face2);
  expect(face2.attributes.advertiseFrom).toBe(false);
  expect(face2.hasRoute("/")).toBeFalsy();
  expect(face2.hasRoute("/Q")).toBeTruthy();
  BufferBreaker.duplex(sock0!, sock1!);

  const rx = vi.fn<[Forwarder.PacketEvent], void>();
  fw.addEventListener("pktrx", rx);
  await Promise.all([
    delay(100),
    face.tx((async function*() {
      yield FwPacket.create(new Interest("/I/0", Interest.Lifetime(50)), 0xA0A1A210);
      await delay(10);
      yield FwPacket.create(new Interest("/I/1", Interest.Lifetime(50)), Uint8Array.of(0xA0, 0x11));
      await delay(10);
      yield FwPacket.create(new Data("/D/2"), undefined, 1);
    })()),
  ]);
  expect(rx).toHaveBeenCalledTimes(3);

  const evt0 = rx.mock.calls[0]![0];
  expect(evt0.face).toBe(face2);
  expect(evt0.packet.l3).toBeInstanceOf(Interest);
  expect(evt0.packet.l3).toHaveName("/I/0");
  expect(evt0.packet.token).toBeInstanceOf(Uint8Array);
  expect(evt0.packet.token).toHaveLength(6);
  expect(asDataView(evt0.packet.token as Uint8Array).getUint32(2)).toBe(0xA0A1A210);
  expect(evt0.packet.congestionMark).toBeUndefined();

  const evt1 = rx.mock.calls[1]![0];
  expect(evt1.face).toBe(face2);
  expect(evt1.packet.l3).toBeInstanceOf(Interest);
  expect(evt1.packet.l3).toHaveName("/I/1");
  expect(evt1.packet.token).toEqualUint8Array([0xA0, 0x11]);
  expect(evt1.packet.congestionMark).toBeUndefined();

  const evt2 = rx.mock.calls[2]![0];
  expect(evt2.face).toBe(face2);
  expect(evt2.packet.l3).toBeInstanceOf(Data);
  expect(evt2.packet.l3).toHaveName("/D/2");
  expect(evt2.packet.token).toBeUndefined();
  expect(evt2.packet.congestionMark).toBe(1);
});
