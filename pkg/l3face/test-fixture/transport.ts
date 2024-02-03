import { FwPacket } from "@ndn/fw";
import { Data, Interest } from "@ndn/packet";
import { delay } from "@ndn/util";
import { abortableSource } from "abortable-iterator";
import type { ReadonlyDeep } from "type-fest";
import { expect } from "vitest";

import { L3Face, type Transport } from "..";

const COUNT = 50;

export interface TestRecord {
  namesA: string[];
  namesB: string[];
}

/**
 * Test a pair of transports.
 * @param transportA - First transport. Packets sent should be received on `transportB`.
 * @param transportB - Second transport. Packets sent should be received on `transportA`.
 * @returns A test record to be analyzed by {@link check}.
 */
export async function execute<T extends Transport>(
    transportA: T, transportB: T,
): Promise<TestRecord> {
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

/**
 * Check test records.
 * @param threshold - Minimum ratio of successful delivered.
 * 0.9 means 90% delivery, i.e. tolerate 10% loss.
 */
export function check({ namesA, namesB }: ReadonlyDeep<TestRecord>, threshold = 0.9) {
  expect(namesA.length).toBeGreaterThanOrEqual(Math.ceil(COUNT * threshold));
  expect(namesB.length).toBeGreaterThanOrEqual(Math.ceil(COUNT * threshold));
  expect(namesA).toHaveLength(new Set(namesA).size);
  expect(namesB).toHaveLength(new Set(namesB).size);
}
