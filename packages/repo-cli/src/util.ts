import { exitClosers } from "@ndn/cli-common";
import { DataStore } from "@ndn/repo";
import leveldown from "leveldown";
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

export function openStore(argv: StoreArgs): DataStore {
  const store = new DataStore(leveldown(argv.store));
  exitClosers.push(store);
  return store;
}
