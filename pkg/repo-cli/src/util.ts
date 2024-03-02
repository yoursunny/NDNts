import { exitClosers } from "@ndn/cli-common";
import { type DataStore, makePersistentDataStore } from "@ndn/repo";
import type { Argv } from "yargs";

export interface StoreArgs {
  store: string;
}

export function declareStoreArgs<T>(argv: Argv<T>): Argv<T & StoreArgs> {
  return argv
    .option("store", {
      demandOption: true,
      desc: "filesystem location for leveldown",
      type: "string",
    });
}

export async function openStore(argv: StoreArgs): Promise<DataStore> {
  const store = await makePersistentDataStore(argv.store);
  exitClosers.push(store);
  return store;
}
