import { Data, Interest } from "@ndn/l3pkt";
import { LLFace } from "@ndn/llface";
import * as net from "net";
import * as rPromise from "remote-controlled-promise";

import { testTransport } from "@ndn/llface/test-fixture";
import { SocketTransport } from "../src";

test("TCP", async () => {
  const faceAp = rPromise.create<LLFace>();
  const faceBp = rPromise.create<LLFace>();
  const done = rPromise.create();

  const server = net.createServer((connA) => {
    server.close();
    faceAp.resolve(new LLFace(new SocketTransport(connA)));
  });
  server.listen(0, "127.0.0.1", async () => {
    const { port } = server.address() as net.AddressInfo;
    const connB = await SocketTransport.connect({ port });
    expect(connB).toBeInstanceOf(SocketTransport);
    faceBp.resolve(new LLFace(connB));
  });
  const [faceA, faceB] = await Promise.all([faceAp.promise, faceBp.promise]);

  process.nextTick(() => {
    faceA.sendInterest(new Interest("/A"));
  });

  faceB.recvInterest.add((interest) => {
    expect(interest.name.toString()).toBe("/A");
    faceB.sendData(new Data(interest.name));
  });

  faceA.recvData.add((data) => {
    expect(data.name.toString()).toBe("/A");
    faceA.close();
  });

  faceB.rxError.add((error) => {
    expect(error.message).toEqual(expect.stringContaining("closed"));
    done.resolve(undefined);
  });

  await done;
});

test("TCP2", async () => {
  const transportAp = rPromise.create<SocketTransport>();
  const transportBp = rPromise.create<SocketTransport>();

  const server = net.createServer((connA) => {
    server.close();
    transportAp.resolve(new SocketTransport(connA));
  });
  server.listen(0, "127.0.0.1", async () => {
    const { port } = server.address() as net.AddressInfo;
    const connB = await SocketTransport.connect({ port });
    expect(connB).toBeInstanceOf(SocketTransport);
    transportBp.resolve(connB);
  });
  const [transportA, transportB] = await Promise.all([transportAp.promise, transportBp.promise]);

  await testTransport(transportA, transportB);
});
