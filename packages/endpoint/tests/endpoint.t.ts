import { Data, Interest } from "@ndn/l3pkt";
import { LLFace } from "@ndn/llface";
import { createTransportPair } from "@ndn/llface/test-fixture/pair";

import { Endpoint } from "../src";

test("expressInterest", async () => {
  const [transportL, transportR] = createTransportPair();
  const endpoint = new Endpoint(transportL);
  const remote = new LLFace(transportR);
  const remoteInterest = jest.fn<void, [Interest]>();
  const interestA = new Interest("/A", Interest.Lifetime(100));
  const interestB = new Interest("/B", Interest.Lifetime(100));

  await Promise.all([
    new Promise((resolve, reject) => {
      remoteInterest
        .mockImplementationOnce(() => undefined)
        .mockImplementationOnce(() => resolve());
      remote.on("interest", remoteInterest)
      .on("interest", (interest) => {
        if (interest.name.at(0).equals("A")) {
          remote.sendData(new Data("/A"));
        }
      });
    }),
    expect(endpoint.expressInterest(interestA).promise).resolves.toBeInstanceOf(Data),
    expect(endpoint.expressInterest(interestB).promise).rejects.toThrow(/timeout/),
  ]);

  expect(remoteInterest).toHaveBeenCalledTimes(2);
});
