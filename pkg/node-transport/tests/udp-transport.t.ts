import * as TestTransport from "@ndn/l3face/test-fixture/transport";
import { Closers, delay } from "@ndn/util";
import { collect } from "streaming-iterables";
import { afterEach, beforeEach, describe, expect, test } from "vitest";

import { udp_helper as udp, UdpTransport } from "..";
import { UdpServer, UdpServerBroadcast } from "../test-fixture/udp-server";

const closers = new Closers();
afterEach(closers.close);

describe.each<[family: udp.AddressFamily, address: string]>([
  [4, "127.0.0.1"],
  [6, "::1"],
])("unicast %d", (family, address) => {
  let server: UdpServerBroadcast;

  beforeEach(async () => {
    server = await UdpServer.create(UdpServerBroadcast, family, address);
  });

  test("pair", async () => {
    const [tA, tB] = await Promise.all([
      UdpTransport.connect(address, server.port),
      UdpTransport.connect({ family, host: "localhost", port: server.port, bind: { address } }),
    ]);
    server.addClient(tB.laddr.port);

    expect(tA.raddr.port).toBe(server.port);
    expect(tA.toString()).toMatch(/^UDP\(/);
    TestTransport.check(await TestTransport.execute(tA, tB));
  });

  test("RX error", async () => {
    const transport = await UdpTransport.connect({
      port: server.port,
      host: "localhost",
      family,
    });
    server.addClient(transport.laddr.port);

    setTimeout(() => server.broadcast(Uint8Array.of(0xF0, 0x01)), 200); // incomplete TLV ignored
    await Promise.all([
      expect(collect(transport.rx)).resolves.toHaveLength(0),
      // eslint-disable-next-line require-yield
      transport.tx((async function*() {
        await delay(400);
      })()),
    ]);
  });
});

const intfs = udp.listMulticastIntfs();
describe.runIf(intfs.length > 0)("multicast", () => {
  const opts: udp.MulticastOptions = {
    intf: intfs[0]!,
    group: "224.0.0.254", // https://datatracker.ietf.org/doc/html/rfc4727#section-2.4.2
    multicastTtl: 0,
    multicastLoopback: true,
  };

  test("loopback", async () => {
    const tA = await UdpTransport.multicast(opts);
    const tB = await UdpTransport.multicast(opts);
    expect(tA.toString()).toMatch(/^UDPm\(/);
    TestTransport.check(await TestTransport.execute(tA, tB));
  });

  test("creates", async () => {
    const faces = await UdpTransport.createMulticastFaces({}, opts);
    closers.push(...faces);
    expect(faces).toHaveLength(intfs.length);
  });
});
