import { Forwarder, FwPacket } from "@ndn/fw";
import { L3Face } from "@ndn/l3face";
import { Interest } from "@ndn/packet";
import * as net from "node:net";
import { collect } from "streaming-iterables";

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
});

afterEach(() => server.close());

test("RX error", async () => {
  setTimeout(() => sock.write(Uint8Array.of(0xF0, 0x00)), 200);
  await Promise.all([
    expect(collect(face.rx)).resolves.toHaveLength(0),
    face.tx((async function*() { // eslint-disable-line require-yield
      await new Promise((r) => setTimeout(r, 400));
    })()),
    expect(new Promise((r) => face.once("rxerror", r))).resolves.toThrow(/F000/),
  ]);
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

  const rx = jest.fn();
  fw.on("pktrx", rx);
  await Promise.all([
    new Promise((r) => setTimeout(r, 100)),
    face.tx((async function*() {
      yield FwPacket.create(new Interest("/Z", Interest.Lifetime(50)));
    })()),
  ]);
  expect(rx).toHaveBeenCalledTimes(1);
  face2.close();
});
