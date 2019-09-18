import { Data, Interest } from "@ndn/l3pkt";
import delay from "delay";
import * as rPromise from "remote-controlled-promise";

import { LLFace, Transport } from "../src";

export async function testTransport(transportA: Transport, transportB: Transport, threshold: number = 0.9) {
  const done = rPromise.create();
  const faceA = new LLFace(transportA);
  const faceB = new LLFace(transportB);

  const count = 50;
  const namesB: Record<string, boolean> = {};
  const namesA: Record<string, boolean> = {};

  process.nextTick(async () => {
    for (let i = 0; i < count; ++i) {
      await delay(0);
      faceA.sendInterest(new Interest(`/A/${i}`));
    }
    await delay(80);
    faceA.close();
  });

  faceB.recvInterest.add((interest) => {
    const name = interest.name.toString();
    expect(namesB[name]).toBeUndefined();
    namesB[name] = true;
    faceB.sendData(new Data(interest.name, new Uint8Array([0xC0, 0xC1])));
  });

  faceA.recvData.add((data) => {
    const name = data.name.toString();
    expect(namesA[name]).toBeUndefined();
    namesA[name] = true;
  });

  faceB.rxError.add((error) => {
    expect(error.message).toEqual(expect.stringContaining("closed"));
    done.resolve(undefined);
  });

  await done.promise;
  expect(Object.keys(namesB).length).toBeGreaterThanOrEqual(Math.ceil(count * threshold));
  expect(Object.keys(namesA).length).toBeGreaterThanOrEqual(Math.ceil(count * threshold));
}
