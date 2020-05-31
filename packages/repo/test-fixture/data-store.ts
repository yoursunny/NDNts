import { Data } from "@ndn/packet";
import memdown from "memdown";

import { DataStore, PrefixRegShorter, RepoProducer } from "..";

export function makeEmptyDataStore(): DataStore {
  return new DataStore(memdown());
}

export async function makeDataStore(...pkts: Data[]): Promise<DataStore> {
  const store = makeEmptyDataStore();
  await store.insert(...pkts);
  return store;
}

export async function makeRepoProducer(data: Data[] = [], opts: RepoProducer.Options = {}): Promise<{
  store: DataStore;
  producer: RepoProducer;
  close: () => void;
}> {
  const store = await makeDataStore(...data);
  const producer = RepoProducer.create(store, {
    describe: "RepoProducer test-fixture",
    reg: PrefixRegShorter(0),
    ...opts,
  });
  return {
    store,
    producer,
    close() {
      store.close().catch(() => undefined);
      producer.close();
    },
  };
}
