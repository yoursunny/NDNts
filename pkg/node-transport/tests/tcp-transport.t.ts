import * as TestReopen from "@ndn/l3face/test-fixture/reopen";
import * as TestTransport from "@ndn/l3face/test-fixture/transport";
import { Closers } from "@ndn/util";
import { beforeEach, expect, test } from "vitest";

import { TcpTransport } from "..";
import { BufferBreaker } from "../test-fixture/buffer-breaker";
import { TcpServer } from "../test-fixture/net-server";

const closers = new Closers();
let server: TcpServer;

beforeEach(async () => {
  server = await TcpServer.create();
  closers.push(server);
  return closers.close;
});

test("pair", async () => {
  const { host, port } = server;
  const [tA, tB, [sockA, sockB]] = await Promise.all([
    TcpTransport.connect(host, port),
    TcpTransport.connect({ host, port }),
    server.waitNClients(2),
  ]);
  BufferBreaker.duplex(sockA!, sockB!);

  expect(tA.toString()).toBe(`TCP(${server.hostport})`);
  TestTransport.check(await TestTransport.execute(tA, tB));
});

test("connect error", async () => {
  const { host, port } = server;
  await server[Symbol.asyncDispose]();
  await Promise.all([
    expect(TcpTransport.connect(host, port, { connectTimeout: 500 })).rejects.toThrow(),
    expect(TcpTransport.connect({ host, port, connectTimeout: 500 })).rejects.toThrow(),
  ]);
});

test("reopen", async () => {
  const { host, port } = server;
  server.sendToClients = true;
  const transport = await TcpTransport.connect(host, port);
  await TestReopen.run(
    transport,
    server.waitNClients,
    (sock) => sock.end(),
  );
});
