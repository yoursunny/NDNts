import type { Data } from "@ndn/packet";
import memdown from "memdown";

import { DataStore, PrefixRegShorter, RepoProducer } from "..";

export async function makeDataStore(...pkts: Data[]): Promise<DataStore> {
  const store = new DataStore(memdown());
  await store.insert(...pkts);
  return store;
}

export function makeRepoProducer(opts?: RepoProducer.Options): Promise<makeRepoProducer.Result>;
export function makeRepoProducer(data: Data[], opts?: RepoProducer.Options): Promise<makeRepoProducer.Result>;

export async function makeRepoProducer(
    arg1: RepoProducer.Options | Data[] = [],
    arg2: RepoProducer.Options = {},
) {
  const [data, opts] = Array.isArray(arg1) ? [arg1, arg2] : [[], arg1];
  const store = await makeDataStore(...data);
  const producer = RepoProducer.create(store, {
    describe: "RepoProducer test-fixture",
    reg: PrefixRegShorter(0),
    ...opts,
  });
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
    close: () => void;
  }
}
