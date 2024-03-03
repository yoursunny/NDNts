import { exitClosers } from "@ndn/cli-common";
import { type DataStore, makePersistentDataStore } from "@ndn/repo";
import type { InferredOptionTypes, Options } from "yargs";

export const storeOptions = {
  store: {
    demandOption: true,
    desc: "filesystem location for LevelDB",
    type: "string",
  },
} satisfies Record<string, Options>;

export type StoreArgs = InferredOptionTypes<typeof storeOptions>;

export async function openStore(argv: StoreArgs): Promise<DataStore> {
  const store = await makePersistentDataStore(argv.store);
  exitClosers.push(store);
  return store;
}
