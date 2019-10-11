import * as TestTransport from "@ndn/l3face/test-fixture/transport";
import * as net from "net";
import * as rPromise from "remote-controlled-promise";

import { SocketTransport } from "../src";

test("TCP", async () => {
  const transportAp = rPromise.create<SocketTransport>();
  const transportBp = rPromise.create<SocketTransport>();

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

  TestTransport.check(await TestTransport.execute(transportA, transportB));
});
