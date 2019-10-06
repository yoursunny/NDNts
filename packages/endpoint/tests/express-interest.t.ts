import { Data, Interest } from "@ndn/l3pkt";
import { LLFace } from "@ndn/llface";
import { createTransportPair } from "@ndn/llface/test-fixture/pair";

import { Endpoint } from "../src";

let endpoint: Endpoint;
let remote: LLFace;

beforeEach(() => {
  const [transportL, transportR] = createTransportPair();
  endpoint = new Endpoint(transportL);
  remote = new LLFace(transportR);
});

test("expressInterest", async () => {
  const remoteInterest = jest.fn<void, [Interest]>();
  const interestA = new Interest("/A", Interest.Lifetime(100));
  const interestB = new Interest("/B", Interest.Lifetime(100));

  remote.on("interest", remoteInterest)
  .on("interest", (interest) => {
    if (interest.name.at(0).equals("A")) {
      remote.sendData(new Data("/A"));
    }
  });

  await Promise.all([
    expect(endpoint.expressInterest(interestA).promise).resolves.toBeInstanceOf(Data),
    expect(endpoint.expressInterest(interestB).promise).rejects.toThrow(/timeout/),
  ]);
  expect(remoteInterest).toHaveBeenCalledTimes(2);
});

test("retransmit", async () => {
  const remoteNonces: number[] = [];
  const remoteInterest = jest.fn<void, [Interest]>((interest) => {
    remoteNonces.push(interest.nonce!);
    if (remoteInterest.mock.calls.length === 3) {
      setTimeout(() => remote.sendData(new Data("/A")), 50);
    }
  });
  remote.on("interest", remoteInterest);

  const nonceA1 = 0x06B288B7;
  const interestA = new Interest("/A", Interest.Lifetime(100), Interest.Nonce(nonceA1));
  const eiA = endpoint.expressInterest(interestA);
  setTimeout(() => {
    expect(eiA.nRetx).toBe(0);
    eiA.retransmit();
  }, 50);
  setTimeout(() => {
    expect(eiA.nRetx).toBe(1);
    eiA.retransmit();
  }, 110);
  await expect(eiA.promise).resolves.toBeInstanceOf(Data);

  expect(eiA.nRetx).toBe(2);
  expect(remoteInterest).toHaveBeenCalledTimes(3);
  expect(remoteNonces[0]).toBe(nonceA1);
  expect(new Set(remoteNonces).size).toBe(3);
});
