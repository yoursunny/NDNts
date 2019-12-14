import "@ndn/packet/test-fixture/expect";

import { L3Face } from "@ndn/l3face";
import { MockTransport } from "@ndn/l3face/test-fixture/mock-transport";
import { Data } from "@ndn/packet";
import memdown from "memdown";
import { collect } from "streaming-iterables";

import { BulkInserter, DataStore } from "..";

let store: DataStore;
beforeEach(() => store = new DataStore(memdown()));
afterEach(() => store.close());

test("simple", async () => {
  const storeInsert = jest.spyOn(store, "insert");
  const transport = new MockTransport();

  const bi = new BulkInserter(store, {
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
  await expect(collect(store.list())).resolves.toHaveLength(500);
});
