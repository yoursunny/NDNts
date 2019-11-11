import * as TestTransport from "@ndn/l3face/test-fixture/transport";
import * as net from "net";
import pDefer from "p-defer";

import { SocketTransport } from "..";

test("TCP", async () => {
  const transportAp = pDefer<SocketTransport>();
  const transportBp = pDefer<SocketTransport>();

  const server = net.createServer((connA) => {
    server.close();
    transportAp.resolve(new SocketTransport(connA));
  });
  server.listen(0, "127.0.0.1", async () => {
    const { port } = server.address() as net.AddressInfo;
    const connB = await SocketTransport.connect({ port });
    expect(connB).toBeInstanceOf(SocketTransport);
    transportBp.resolve(connB);
  });
  const [transportA, transportB] = await Promise.all([transportAp.promise, transportBp.promise]);

  expect(transportB.toString()).toBe("Socket(127.0.0.1)");
  TestTransport.check(await TestTransport.execute(transportA, transportB));
});
