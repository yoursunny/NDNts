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
  server = await new TcpServer().open();
  closers.push(server);
  return closers.close;
});

test("pair", async () => {
  const [tA, tB, [sockA, sockB]] = await Promise.all([
    TcpTransport.connect("127.0.0.1", server.port),
    TcpTransport.connect({ port: server.port }),
    server.waitNClients(2),
  ]);
  BufferBreaker.duplex(sockA!, sockB!);

  expect(tA.toString()).toBe(`TCP(127.0.0.1:${server.port})`);
  TestTransport.check(await TestTransport.execute(tA, tB));
});

test("connect error", async () => {
  const port = server.port;
  await server[Symbol.asyncDispose]();
  await Promise.all([
    expect(TcpTransport.connect("localhost", port, { connectTimeout: 500 })).rejects.toThrow(),
    expect(TcpTransport.connect({ port, connectTimeout: 500 })).rejects.toThrow(),
  ]);
});

test("reopen", async () => {
  server.sendToClients = true;
  const transport = await TcpTransport.connect("localhost", server.port);
  await TestReopen.run(
    transport,
    server.waitNClients,
    (sock) => sock.end(),
  );
});
