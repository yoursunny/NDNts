import { Data, Interest } from "@ndn/l3pkt";

import { L3Face, Transport } from "../src";

const COUNT = 50;

export interface TestRecord {
  namesA: string[];
  namesB: string[];
}

export async function execute(transportA: Transport, transportB: Transport): Promise<TestRecord> {
  const faceA = new L3Face(transportA);
  const faceB = new L3Face(transportB);

  const record: TestRecord = {
    namesA: [],
    namesB: [],
  };

  await Promise.all([
    faceA.tx({ async *[Symbol.asyncIterator]() {
      for (let i = 0; i < COUNT; ++i) {
        await new Promise((r) => setTimeout(r, 1));
        yield new Interest(`/A/${i}`);
      }
      await new Promise((r) => setTimeout(r, 80));
    } }),
    faceB.tx({ async *[Symbol.asyncIterator]() {
      for await (const pkt of faceB.rx) {
        if (pkt instanceof Interest) {
          const name = pkt.name.toString();
          record.namesB.push(name);
          yield new Data(pkt.name, Uint8Array.of(0xC0, 0xC1));
        }
      }
    } }),
    (async () => {
      for await (const pkt of faceA.rx) {
        if (pkt instanceof Data) {
          const name = pkt.name.toString();
          record.namesA.push(name);
        }
      }
    })(),
  ]);

  return record;
}

export function check(record: TestRecord, threshold: number = 0.9) {
  expect(record.namesA.length).toBeGreaterThanOrEqual(Math.ceil(COUNT * threshold));
  expect(record.namesB.length).toBeGreaterThanOrEqual(Math.ceil(COUNT * threshold));
  expect(record.namesA).toHaveLength(new Set(record.namesA).size);
  expect(record.namesB).toHaveLength(new Set(record.namesB).size);
}
