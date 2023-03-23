import { FwPacket } from "@ndn/fw";
import { Data, Interest } from "@ndn/packet";
import { delay } from "@ndn/util";
import { abortableSource } from "abortable-iterator";
import { expect } from "vitest";

import { L3Face, type Transport } from "..";

const COUNT = 50;

export interface TestRecord {
  namesA: string[];
  namesB: string[];
}

export async function execute<T extends Transport>(
    transportA: T, transportB: T): Promise<TestRecord> {
  const faceA = new L3Face(transportA, { describe: "A" });
  const faceB = new L3Face(transportB, { describe: "B" });

  const record: TestRecord = {
    namesA: [],
    namesB: [],
  };
  const abortFaceB = new AbortController();

  await Promise.all([
    faceA.tx({ async *[Symbol.asyncIterator]() {
      for (let i = 0; i < COUNT; ++i) {
        await delay(1);
        yield FwPacket.create(new Interest(`/A/${i}`));
      }
      await delay(200);
      abortFaceB.abort();
    } }),
    faceB.tx({ async *[Symbol.asyncIterator]() {
      const it = faceB.rx[Symbol.asyncIterator]();
      it.return = undefined;
      for await (const { l3 } of abortableSource({ [Symbol.asyncIterator]() { return it; } },
        abortFaceB.signal, { returnOnAbort: true })) {
        if (l3 instanceof Interest) {
          const name = l3.name.toString();
          record.namesB.push(name);
          yield FwPacket.create(new Data(l3.name, Uint8Array.of(0xC0, 0xC1)));
        }
      }
    } }),
    (async () => {
      for await (const { l3 } of faceA.rx) {
        if (l3 instanceof Data) {
          const name = l3.name.toString();
          record.namesA.push(name);
        }
      }
    })(),
  ]);

  return record;
}

export function check(record: TestRecord, threshold = 0.9) {
  expect(record.namesA.length).toBeGreaterThanOrEqual(Math.ceil(COUNT * threshold));
  expect(record.namesB.length).toBeGreaterThanOrEqual(Math.ceil(COUNT * threshold));
  expect(record.namesA).toHaveLength(new Set(record.namesA).size);
  expect(record.namesB).toHaveLength(new Set(record.namesB).size);
}
