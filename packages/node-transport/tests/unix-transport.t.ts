import * as TestReopen from "@ndn/l3face/test-fixture/reopen";
import * as TestTransport from "@ndn/l3face/test-fixture/transport";

import { UnixTransport } from "..";
import * as NetServerTest from "../test-fixture/net-server";

beforeEach(NetServerTest.createIpcServer);

afterEach(NetServerTest.destroyServer);

test("pair", async () => {
  const [tA, tB, [sockA, sockB]] = await Promise.all([
    UnixTransport.connect(NetServerTest.ipcPath),
    UnixTransport.connect({ path: NetServerTest.ipcPath }),
    NetServerTest.waitNClients(2),
  ]);
  NetServerTest.enableDuplex(sockA!, sockB!);

  expect(tA.toString()).toMatch(/^Unix\(/);
  TestTransport.check(await TestTransport.execute(tA, tB));
});

test("connect error", async () => {
  const path = NetServerTest.ipcPath;
  await NetServerTest.destroyServer();
  await expect(UnixTransport.connect(path)).rejects.toThrow();
});

test("reopen", async () => {
  NetServerTest.enableSendToClients();
  const transport = await UnixTransport.connect(NetServerTest.ipcPath);
  await TestReopen.run(
    transport,
    NetServerTest.waitNClients,
    (sock) => sock.destroy(),
  );
});
