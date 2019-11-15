import * as TestReopen from "@ndn/l3face/test-fixture/reopen";
import * as TestTransport from "@ndn/l3face/test-fixture/transport";

import { TcpTransport } from "..";
import * as NetServerTest from "../test-fixture/net-server";

beforeEach(NetServerTest.createTcpServer);

afterEach(NetServerTest.destroyServer);

test("pair", async () => {
  const [tA, tB, [sockA, sockB]] = await Promise.all([
    TcpTransport.connect("localhost", NetServerTest.tcpPort),
    TcpTransport.connect({ port: NetServerTest.tcpPort }),
    NetServerTest.waitNClients(2),
  ]);
  NetServerTest.enableDuplex(sockA, sockB);

  expect(tA.toString()).toBe(`TCP(127.0.0.1:${NetServerTest.tcpPort})`);
  TestTransport.check(await TestTransport.execute(tA, tB));
});

test("connect error", async () => {
  const port = NetServerTest.tcpPort;
  NetServerTest.destroyServer();
  await expect(TcpTransport.connect("localhost", port)).rejects.toThrow();
});

test("reopen", async () => {
  NetServerTest.enableSendToClients();
  const transport = await TcpTransport.connect("localhost", NetServerTest.tcpPort);
  await TestReopen.run(
    transport,
    NetServerTest.waitNClients,
    (sock) => sock.end(),
  );
});
