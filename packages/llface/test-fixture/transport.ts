import { Data, Interest } from "@ndn/l3pkt";
import * as rPromise from "remote-controlled-promise";

import { LLFace, Transport } from "../src";

const COUNT = 50;

export interface TestRecord {
  namesA: string[];
  namesB: string[];
}

export async function execute(transportA: Transport, transportB: Transport): Promise<TestRecord> {
  const faceA = new LLFace(transportA);
  const faceB = new LLFace(transportB);

  const record: TestRecord = {
    namesA: [],
    namesB: [],
  };

  process.nextTick(async () => {
    for (let i = 0; i < COUNT; ++i) {
      await new Promise((r) => setTimeout(r, 1));
      faceA.sendInterest(new Interest(`/A/${i}`));
    }
    await new Promise((r) => setTimeout(r, 80));
    faceA.close();
  });

  faceB.on("interest", (interest) => {
    const name = interest.name.toString();
    record.namesB.push(name);
    faceB.sendData(new Data(interest.name, new Uint8Array([0xC0, 0xC1])));
  });

  faceA.on("data", (data) => {
    const name = data.name.toString();
    record.namesA.push(name);
  });

  const endP = rPromise.create();
  faceB.on("end", () => endP.resolve(undefined));
  await endP.promise;

  return record;
}

export function check(record: TestRecord, threshold: number = 0.9) {
  expect(record.namesA.length).toBeGreaterThanOrEqual(Math.ceil(COUNT * threshold));
  expect(record.namesB.length).toBeGreaterThanOrEqual(Math.ceil(COUNT * threshold));
  expect(record.namesA).toHaveLength(new Set(record.namesA).size);
  expect(record.namesB).toHaveLength(new Set(record.namesB).size);
}
