import { Data, Interest } from "@ndn/l3pkt";
import delay from "delay";
import * as rPromise from "remote-controlled-promise";

import { LLFace, Transport } from "../src";

const COUNT = 50;

export interface TestRecord {
  namesA: string[];
  namesB: string[];
  closingB: string;
}

export async function execute(transportA: Transport, transportB: Transport): Promise<TestRecord> {
  const done = rPromise.create();
  const faceA = new LLFace(transportA);
  const faceB = new LLFace(transportB);

  const record: TestRecord = {
    namesA: [],
    namesB: [],
    closingB: "",
  };

  process.nextTick(async () => {
    for (let i = 0; i < COUNT; ++i) {
      await delay(0);
      faceA.sendInterest(new Interest(`/A/${i}`));
    }
    await delay(80);
    faceA.close();
  });

  faceB.recvInterest.add((interest) => {
    const name = interest.name.toString();
    record.namesB.push(name);
    faceB.sendData(new Data(interest.name, new Uint8Array([0xC0, 0xC1])));
  });

  faceA.recvData.add((data) => {
    const name = data.name.toString();
    record.namesA.push(name);
  });

  faceB.rxError.add((error) => {
    record.closingB = error.message;
    done.resolve(undefined);
  });

  await done.promise;
  return record;
}

export function check(record: TestRecord, threshold: number = 0.9) {
  expect(record.namesA.length).toBeGreaterThanOrEqual(Math.ceil(COUNT * threshold));
  expect(record.namesB.length).toBeGreaterThanOrEqual(Math.ceil(COUNT * threshold));
  expect(record.namesA).toHaveLength(new Set(record.namesA).size);
  expect(record.namesB).toHaveLength(new Set(record.namesB).size);
  expect(record.closingB).toMatch(/closed/);
}
