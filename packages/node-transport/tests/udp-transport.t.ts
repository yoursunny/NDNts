import * as TestTransport from "@ndn/l3face/test-fixture/transport";
import * as dgram from "dgram";

import { UdpTransport } from "../src";

let server: dgram.Socket;
let serverPort: number;
const clientPorts = new Set<number>();

beforeEach(async () => {
  server = dgram.createSocket({
    type: "udp4",
    reuseAddr: true,
  });
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
  const [transportA, transportB] = await Promise.all([
    UdpTransport.connect({ port: serverPort, host: "localhost" }),
    UdpTransport.connect({ port: serverPort, host: "127.0.0.1", bind: { address: "127.0.0.1" } }),
  ]);
  clientPorts.add(transportA.laddr.port);
  clientPorts.add(transportB.laddr.port);

  expect(transportA.toString()).toBe("UDP(127.0.0.1)");
  expect(transportB.toString()).toBe("UDP(127.0.0.1)");
  TestTransport.check(await TestTransport.execute(
    transportA, transportB, (t) => t.close(),
  ));
});
