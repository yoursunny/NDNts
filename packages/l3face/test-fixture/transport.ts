import { Data, Interest } from "@ndn/l3pkt";
import AbortController from "abort-controller";
import abortable from "abortable-iterator";

import { L3Face, Transport } from "..";

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
        await new Promise((r) => setTimeout(r, 1));
        yield new Interest(`/A/${i}`);
      }
      await new Promise((r) => setTimeout(r, 200));
      abortFaceB.abort();
    } }),
    faceB.tx({ async *[Symbol.asyncIterator]() {
      const it = faceB.rx[Symbol.asyncIterator]();
      // eslint-disable-next-line @typescript-eslint/unbound-method
      it.return = undefined;
      for await (const pkt of abortable({ [Symbol.asyncIterator]() { return it; } },
                                        abortFaceB.signal, { returnOnAbort: true })) {
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
