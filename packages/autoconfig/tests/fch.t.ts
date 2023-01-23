import "@ndn/packet/test-fixture/expect";

import { afterEach, beforeAll, expect, test } from "vitest";

import { fchQuery } from "..";
import { FchServer } from "../test-fixture/fch-server";

let server: FchServer;
beforeAll(async () => {
  server = await FchServer.create();
  return () => { server.close(); };
});
afterEach(() => server.handle = undefined);

test("json", async () => {
  const updated = Date.now() - 300000;
  server.handle = async () => ({
    updated,
    routers: [
      {
        transport: "udp",
        connect: "127.0.0.1:7001",
      },
      {
        transport: "udp",
        connect: "127.0.0.1:7002",
        prefix: "/7002",
      },
    ],
  });

  const res = await fchQuery({
    server: server.uri,
    transport: "udp",
    count: 3,
  });
  expect(res.updated).toEqual(new Date(updated));
  expect(res.routers).toHaveLength(2);
  res.routers.sort((a, b) => a.connect.localeCompare(b.connect));
  expect(res.routers[0]).toMatchObject({ transport: "udp", connect: "127.0.0.1:7001" });
  expect(res.routers[1]).toMatchObject({ transport: "udp", connect: "127.0.0.1:7002" });
  expect(res.routers[1]?.prefix).toEqualName("/7002");
});

test("text", async () => {
  server.handle = async (search: URLSearchParams) => {
    expect(search.get("cap")).toBe("udp");
    expect(search.get("k")).toBe("2");
    expect(search.get("ipv4")).toBe("1");
    expect(search.get("ipv6")).toBe("0");
    expect(Number.parseFloat(String(search.get("lon")))).toBeCloseTo(-77.2016, 2);
    expect(Number.parseFloat(String(search.get("lat")))).toBeCloseTo(39.144, 2);
    expect(search.get("network")).toBe("demo-network");
    return "127.0.0.1:7001,127.0.0.1:7002";
  };

  const res = await fchQuery({
    server: server.uri,
    transports: ["udp"],
    count: 2,
    ipv4: true,
    ipv6: false,
    position: [-77.2016, 39.144],
    network: "demo-network",
  });
  expect(res.updated).toBeUndefined();
  expect(res.routers).toHaveLength(2);
  res.routers.sort((a, b) => a.connect.localeCompare(b.connect));
  expect(res.routers[0]).toMatchObject({ transport: "udp", connect: "127.0.0.1:7001" });
  expect(res.routers[1]).toMatchObject({ transport: "udp", connect: "127.0.0.1:7002" });
});

test("text2", async () => {
  server.handle = async (search: URLSearchParams) => {
    const cap = search.getAll("cap").join(",");
    const k = search.getAll("k").join(",");
    switch (cap) {
      case "udp,wss": {
        expect(k).toBe("2,1");
        return "127.0.0.1:7001,127.0.0.1:7002,127.0.0.1:7003";
      }
      case "wss,udp": {
        expect(k).toBe("1,2");
        return "127.0.0.1:7001,127.0.0.1:7002,127.0.0.1:7003";
      }
      case "udp": {
        expect(k).toBe("2");
        return "127.0.0.1:7001,127.0.0.1:7002";
      }
      case "wss": {
        expect(k).toBe("1");
        return "127.0.0.1:7003";
      }
    }
    throw new Error(`unexpected cap=${cap}`);
  };

  const res = await fchQuery({
    server: server.uri,
    transports: { udp: 2, wss: 1 },
  });
  expect(res.updated).toBeUndefined();
  expect(res.routers).toHaveLength(3);
  res.routers.sort((a, b) => a.connect.localeCompare(b.connect));
  expect(res.routers[0]).toMatchObject({ transport: "udp", connect: "127.0.0.1:7001" });
  expect(res.routers[1]).toMatchObject({ transport: "udp", connect: "127.0.0.1:7002" });
  expect(res.routers[2]).toMatchObject({ transport: "wss", connect: "127.0.0.1:7003" });
});

test("server error", async () => {
  server.handle = async (params, ctx) => {
    ctx.status = 500;
    return "";
  };
  await expect(fchQuery({ server: server.uri })).resolves.toMatchObject({ routers: [] });

  server.handle = async () => "";
  await expect(fchQuery({ server: server.uri })).resolves.toMatchObject({ routers: [] });
});
