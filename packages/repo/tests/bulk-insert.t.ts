import "@ndn/packet/test-fixture/expect";

import { L3Face } from "@ndn/l3face";
import { MockTransport } from "@ndn/l3face/test-fixture/mock-transport";
import { Data } from "@ndn/packet";
import { collect } from "streaming-iterables";

import { BulkInsertInitiator, BulkInsertTarget, DataStore } from "..";
import { makeEmptyDataStore } from "../test-fixture/data-store";

let store: DataStore;
beforeEach(() => store = makeEmptyDataStore());
afterEach(() => store.close());

test("target", async () => {
  const storeInsert = jest.spyOn(store, "insert");
  const transport = new MockTransport();

  const bi = new BulkInsertTarget(store, {
    batch: 32,
    parallel: 8,
  });

  await Promise.all([
    expect(bi.accept(new L3Face(transport))).resolves.toBeUndefined(),
    (async () => {
      for (let i = 0; i < 500; ++i) {
        transport.recv(new Data(`/A/${i}`));
        if (i % 20 === 0) {
          await new Promise((r) => setTimeout(r, Math.random() * 5));
        }
      }
      transport.close();
    })(),
  ]);

  expect(storeInsert).toHaveBeenCalledTimes(16);
  await expect(collect(store.listData())).resolves.toHaveLength(500);
});

test("initiator", async () => {
  const transport = new MockTransport();
  const bi = new BulkInsertInitiator(new L3Face(transport));
  let n = 0;
  for (let i = 0; i < 10; ++i) {
    await new Promise((r) => setTimeout(r, Math.random() * 20));
    const pkts: Data[] = [];
    const count = Math.floor(Math.random() * 64);
    for (let j = 0; j < count; ++j) {
      pkts.push(new Data(`/D/${++n}`));
    }
    await bi.insert(...pkts);
  }
  await bi.close();
  expect(transport.sent).toHaveLength(n);
});
