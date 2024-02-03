import { Endpoint } from "@ndn/endpoint";
import { Forwarder, type FwFace } from "@ndn/fw";
import { UdpServer, UdpServerForwarder } from "@ndn/node-transport/test-fixture/udp-server";
import { Data, Name } from "@ndn/packet";
import { Closers, delay } from "@ndn/util";
import defaultGateway from "default-gateway";
import { afterEach, expect, test, vi } from "vitest";

import { connectToNetwork } from "..";
import { FchServer } from "../test-fixture/fch-server";

const closers = new Closers();
afterEach(() => {
  closers.close();
  Forwarder.deleteDefault();
});

async function addServerWithDelayProducer(delayDuration: number): Promise<string> {
  const server = await UdpServer.create(UdpServerForwarder);
  const producer = new Endpoint({ fw: server.fw }).produce("/localhop/test-connection", async (interest) => {
    await delay(delayDuration);
    return new Data(interest.name);
  });
  closers.push(server, producer);
  return server.hostport;
}

async function addClosedServers(count = 1): Promise<string[]> {
  using servers = new Closers();
  const hostPorts: string[] = [];
  for (let i = 0; i < count; ++i) {
    const server = await UdpServer.create(UdpServerForwarder);
    hostPorts.push(server.hostport);
    servers.push(server);
  }
  return hostPorts;
}

test("connectToNetwork", async () => {
  const servers = [
    await addServerWithDelayProducer(900),
    await addServerWithDelayProducer(100),
    await addServerWithDelayProducer(700),
    ...await addClosedServers(),
  ];

  const faces = await connectToNetwork({
    fch: false,
    tryDefaultGateway: false,
    fallback: servers,
    testConnection: "/localhop/test-connection/*",
    testConnectionTimeout: 1500,
  });
  closers.push(...faces);
  expect(faces).toHaveLength(1);
  expect(faces[0]!.toString()).toContain(servers[1]);

  const fw2 = Forwarder.create();
  const faces2 = await connectToNetwork({
    fw: fw2,
    fch: false,
    tryDefaultGateway: false,
    fallback: servers,
    fastest: 2,
    testConnection: ["/localhop/test-connection/*", new Name("/unreachable")],
    testConnectionTimeout: 1500,
  });
  closers.push(...faces2);
  expect(faces2).toHaveLength(2);
});

test("defaultGateway", async () => {
  await using fchServer = await FchServer.create(() => "127.0.0.1:7001,127.0.0.1:7002");
  const mockGatewayResult: defaultGateway.Result<4> = {
    gateway: "127.0.0.1",
    version: 4,
    int: "eth0",
  };
  const mockGateway = vi.fn<[], Promise<defaultGateway.Result<4>>>().mockResolvedValue(mockGatewayResult);
  vi.doMock("default-gateway", (): typeof defaultGateway => ({
    ...defaultGateway,
    gateway4async: mockGateway,
  }));

  let calledWith6363 = false;
  let calledWith7004 = false;
  const testConnection = vi.fn<[FwFace], Promise<unknown>>()
    .mockImplementation(async (face) => {
      const faceDescribe = face.toString();
      calledWith6363 ||= faceDescribe.includes("127.0.0.1:6363");
      calledWith7004 ||= faceDescribe.includes("127.0.0.1:7004");
      if (!faceDescribe.includes("127.0.0.1:7001")) {
        throw new Error("mock reject");
      }
    });

  const faces = await connectToNetwork({
    fch: { server: fchServer.uri },
    fallback: ["127.0.0.1:7004"],
    testConnection,
  });
  closers.push(...faces);
  expect(faces).toHaveLength(1);
  expect(faces[0]!.toString()).toContain("127.0.0.1:7001");

  expect(mockGateway).toHaveBeenCalled();

  expect(testConnection).toHaveBeenCalledTimes(3);
  expect(calledWith6363).toBeTruthy();
  expect(calledWith7004).toBeFalsy();
}, { timeout: 10000 });

test("connectFailure", async () => {
  const testConnection = vi.fn<[FwFace], Promise<unknown>>()
    .mockRejectedValue(new Error("mock reject"));

  await expect(connectToNetwork({
    fch: false,
    tryDefaultGateway: false,
    fallback: ["127.0.0.1:7001", "127.0.0.1:7002"],
    testConnection,
  })).rejects.toThrow(/connect to network failed/);

  expect(testConnection).toHaveBeenCalledTimes(2);
});
