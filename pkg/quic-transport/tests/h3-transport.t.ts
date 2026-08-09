import * as TestReopen from "@ndn/l3face/test-fixture/reopen";
import * as TestTransport from "@ndn/l3face/test-fixture/transport";
import { Closers } from "@ndn/util";
import { beforeEach, expect, test } from "vitest";

import { H3Transport } from "..";
import { bridgeSessions, WtServer } from "../test-fixture/wt-server";

const closers = new Closers();
let server: WtServer;
beforeEach(async () => {
  server = await WtServer.create();
  closers.push(server);
  return closers.close;
});

test("pair", async () => {
  const { uri } = server;
  const [tA, tB, sockets] = await Promise.all([
    H3Transport.connect(uri, { connectTimeout: 500, insecureSkipVerify: true }),
    H3Transport.connect(uri, { connectTimeout: 500, insecureSkipVerify: true }),
    server.waitNClients(2),
  ]);

  expect(tA.toString()).toBe(`H3(${uri})`);

  bridgeSessions(sockets);
  TestTransport.check(await TestTransport.execute(tA, tB));
});

test("connect error - timeout", async () => {
  const { uri } = server;
  await server[Symbol.asyncDispose]();
  await expect(H3Transport.connect(uri, { connectTimeout: 500, insecureSkipVerify: true })).rejects.toThrow(/timeout/);
});

test("connect error - untrusted", async () => {
  const { uri } = server;
  await expect(H3Transport.connect(uri, { connectTimeout: 500 })).rejects.toThrow(/UnknownIssuer/);
});

test("reopen", async () => {
  const { uri } = server;
  const transport = await H3Transport.connect(uri, { connectTimeout: 500, insecureSkipVerify: true });
  await TestReopen.run(
    transport,
    server.waitNClients,
    (sess) => sess.close(),
  );
});
