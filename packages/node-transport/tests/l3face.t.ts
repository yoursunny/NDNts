import { L3Face } from "@ndn/l3face";
import * as net from "net";
import { collect } from "streaming-iterables";

import { UnixTransport } from "..";
import * as NetServerTest from "../test-fixture/net-server";

let sock: net.Socket;
let transport: UnixTransport;
let face: L3Face;

beforeEach(async () => {
  await NetServerTest.createIpcServer();
  [transport, [sock]] = await Promise.all([
    UnixTransport.connect(NetServerTest.ipcPath),
    NetServerTest.waitNClients(1),
  ]);
  face = new L3Face(transport);
});

afterEach(NetServerTest.destroyServer);

test("RX error", async () => {
  setTimeout(() => sock.write(Uint8Array.of(0xF0, 0x00)), 200);
  await Promise.all([
    expect(collect(face.rx)).resolves.toHaveLength(0),
    // eslint-disable-next-line require-yield
    face.tx((async function*() {
      await new Promise((r) => setTimeout(r, 400));
    })()),
    expect(new Promise((r) => face.once("rxerror", r))).resolves.toThrow(/F000/),
  ]);
});
