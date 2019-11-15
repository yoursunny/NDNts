import * as TestTransport from "@ndn/l3face/test-fixture/transport";
import * as dgram from "dgram";
import * as dgram12 from "dgram12";

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

test("UDP", async () => {
  const [tA, tB] = await Promise.all([
    UdpTransport.connect({ port: serverPort, host: "localhost" }),
    UdpTransport.connect({ port: serverPort, host: "127.0.0.1", bind: { address: "127.0.0.1" } }),
  ]);
  clientPorts.add(tA.laddr.port);
  clientPorts.add(tB.laddr.port);

  expect(tA.raddr.port).toBe(serverPort);
  expect(tA.toString()).toBe("UDP(127.0.0.1)");
  expect(tB.toString()).toBe("UDP(127.0.0.1)");
  TestTransport.check(await TestTransport.execute(tA, tB));
});
