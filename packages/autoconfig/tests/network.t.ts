import { Endpoint } from "@ndn/endpoint";
import { Closers } from "@ndn/l3face/test-fixture/closers";
import { UdpServer, UdpServerForwarder } from "@ndn/node-transport/test-fixture/udp-server";
import { Data } from "@ndn/packet";

import { connectToNetwork } from "..";

const closers = new Closers();
afterEach(closers.close);

async function addServerWithDelayProducer(delay: number): Promise<string> {
  const server = await UdpServer.create(UdpServerForwarder);
  const producer = new Endpoint({ fw: server.fw }).produce("/localhop/test-connection", async (interest) => {
    await new Promise((r) => setTimeout(r, delay));
    return new Data(interest.name);
  });
  closers.push(server, producer);
  return server.hostport;
}

test("connectToNetwork", async () => {
  const servers = [
    await addServerWithDelayProducer(900),
    await addServerWithDelayProducer(100),
    await addServerWithDelayProducer(700),
  ];
  const closedServer = await UdpServer.create(UdpServerForwarder);
  servers.push(closedServer.hostport);
  closedServer.close();

  const faces = await connectToNetwork({
    fch: false,
    tryDefaultGateway: false,
    fallback: servers,
    testConnection: "/localhop/test-connection/*",
    testConnectionTimeout: 1500,
  });
  expect(faces).toHaveLength(1);
  expect(faces[0]!.toString()).toContain(servers[1]);
  faces[0]!.close();
});
