import * as TestTransport from "@ndn/l3face/test-fixture/transport";
import * as dgram from "dgram";
import * as dgram12 from "dgram12";
import { collect } from "streaming-iterables";

import { UdpTransport } from "..";

let server: dgram12.Socket;
let serverPort: number;
const clientPorts = new Set<number>();

beforeEach(async () => {
  server = dgram.createSocket({
    type: "udp4",
    reuseAddr: true,
  }) as dgram12.Socket;
  serverPort = await new Promise<number>((r) =>
               server.bind({ address: "127.0.0.1" }, () => r(server.address().port)));
  server.on("message", (msg, { port }) => {
    for (const clientPort of clientPorts) {
      if (port === clientPort) {
        continue;
      }
      server.send(msg, clientPort);
    }
  });
});

afterEach((done) => {
  clientPorts.clear();
  server.close(done);
});

test("pair", async () => {
  const [tA, tB] = await Promise.all([
    UdpTransport.connect("localhost", serverPort),
    UdpTransport.connect({ host: "127.0.0.1", port: serverPort, bind: { address: "127.0.0.1" } }),
  ]);
  clientPorts.add(tA.laddr.port);
  clientPorts.add(tB.laddr.port);

  expect(tA.raddr.port).toBe(serverPort);
  expect(tA.toString()).toBe("UDP(127.0.0.1)");
  expect(tB.toString()).toBe("UDP(127.0.0.1)");
  TestTransport.check(await TestTransport.execute(tA, tB));
});

test("RX error", async () => {
  const transport = await UdpTransport.connect({ port: serverPort, host: "localhost" });
  setTimeout(() => server.send(Uint8Array.of(0xF0, 0x01), transport.laddr.port), 200); // incomplete TLV ignored
  await Promise.all([
    expect(collect(transport.rx)).resolves.toHaveLength(0),
    // eslint-disable-next-line require-yield
    transport.tx((async function*() {
      await new Promise((r) => setTimeout(r, 400));
    })()),
  ]);
});
