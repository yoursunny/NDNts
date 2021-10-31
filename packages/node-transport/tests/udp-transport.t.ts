import * as TestTransport from "@ndn/l3face/test-fixture/transport";
import * as dgram from "node:dgram";
import { setTimeout as delay } from "node:timers/promises";
import { collect } from "streaming-iterables";

import { udp_helper as udp, UdpTransport } from "..";
import { UdpServer, UdpServerBroadcast } from "../test-fixture/udp-server";

test("SocketOption type", () => {
  const x: Required<dgram.SocketOptions> extends Required<udp.SocketBufferOption> ? boolean : never = true;
  expect(x).toBeTruthy();
});

describe.each([
  { family: 4, address: "127.0.0.1" },
  { family: 6, address: "::1" },
] as Array<{ family: udp.AddressFamily; address: string }>)("unicast %p", ({ family, address }) => {
  let server: UdpServerBroadcast;

  beforeEach(async () => {
    server = await UdpServer.create(UdpServerBroadcast, family, address);
  });

  afterEach(() => {
    server.close();
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

describe("multicast", () => {
  const intfs = udp.listMulticastIntfs();
  if (intfs.length === 0) {
    // eslint-disable-next-line jest/no-disabled-tests
    test.skip("no multicast interface", () => undefined);
    return;
  }

  const opts: udp.MulticastOptions = {
    intf: intfs[0]!,
    group: "224.0.0.254", // https://tools.ietf.org/html/rfc4727#section-2.4.2
    port: 56363,
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
    expect(faces).toHaveLength(intfs.length);
    for (const face of faces) {
      face.close();
    }
  });
});
