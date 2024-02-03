import type { Data } from "@ndn/packet";
import { delay } from "@ndn/util";
import memdown from "memdown";

import { DataStore, PrefixRegShorter, RepoProducer } from "..";

/** Create in-memory DataStore populated with packets. */
export async function makeDataStore(...pkts: readonly Data[]): Promise<DataStore> {
  const store = new DataStore(memdown());
  await store.insert(...pkts);
  return store;
}

/** Create RepoProducer backed by in-memory DataStore. */
export function makeRepoProducer(opts?: RepoProducer.Options): Promise<makeRepoProducer.Result>;

/** Create RepoProducer backed by in-memory DataStore populated with packets. */
export function makeRepoProducer(pkts: readonly Data[], opts?: RepoProducer.Options): Promise<makeRepoProducer.Result>;

export async function makeRepoProducer(
    pkts: RepoProducer.Options | readonly Data[] = [],
    opts: RepoProducer.Options = {},
) {
  if (!Array.isArray(pkts)) {
    opts = pkts as RepoProducer.Options;
    pkts = [];
  }
  const store = await makeDataStore(...pkts);
  const producer = RepoProducer.create(store, {
    describe: "RepoProducer test-fixture",
    reg: PrefixRegShorter(0),
    ...opts,
  });
  await delay(10); // allow prefix registrations to take effect
  return {
    store,
    producer,
    async close() {
      try {
        await store.close();
        producer.close();
      } catch {}
    },
  };
}

export namespace makeRepoProducer {
  export interface Result {
    store: DataStore;
    producer: RepoProducer;
    close(): void;
  }
}