import type { Data } from "@ndn/packet";
import { Closers, delay } from "@ndn/util";

import { type DataStore, makeInMemoryDataStore, PrefixRegShorter, RepoProducer } from "..";

/** Create RepoProducer backed by in-memory DataStore populated with packets. */
export async function makeRepoProducer(
    opts: RepoProducer.Options = {},
    pkts: readonly Data[] = [],
) {
  const store = await makeInMemoryDataStore();
  await store.insert(...pkts);
  const producer = RepoProducer.create(store, {
    describe: "RepoProducer test-fixture",
    reg: PrefixRegShorter(0),
    ...opts,
  });
  const closers = new Closers(store, producer);
  await delay(10); // allow prefix registrations to take effect
  return {
    store,
    producer,
    close: closers.close,
  };
}

export namespace makeRepoProducer {
  export interface Result {
    store: DataStore;
    producer: RepoProducer;
    close: () => void;
  }
}
