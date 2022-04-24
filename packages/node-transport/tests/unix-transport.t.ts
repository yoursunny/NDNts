import * as TestReopen from "@ndn/l3face/test-fixture/reopen";
import * as TestTransport from "@ndn/l3face/test-fixture/transport";
import { afterEach, beforeEach, expect, test } from "vitest";

import { UnixTransport } from "..";
import { BufferBreaker } from "../test-fixture/buffer-breaker";
import { IpcServer } from "../test-fixture/net-server";

let server: IpcServer;

beforeEach(async () => {
  server = new IpcServer();
  await server.open();
});

afterEach(() => server.close());

test("pair", async () => {
  const [tA, tB, [sockA, sockB]] = await Promise.all([
    UnixTransport.connect(server.path),
    UnixTransport.connect({ path: server.path }),
    server.waitNClients(2),
  ]);
  BufferBreaker.duplex(sockA!, sockB!);

  expect(tA.toString()).toMatch(/^Unix\(/);
  TestTransport.check(await TestTransport.execute(tA, tB));
});

test("connect error", async () => {
  const path = server.path;
  await server.close();
  await expect(UnixTransport.connect(path)).rejects.toThrow();
});

test("reopen", async () => {
  server.sendToClients = true;
  const transport = await UnixTransport.connect(server.path);
  await TestReopen.run(
    transport,
    server.waitNClients,
    (sock) => sock.destroy(),
  );
});
