import { DataStore } from "@ndn/repo";
import leveldown from "leveldown";
import { Argv } from "yargs";

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

export let store: DataStore;

export function openStore(argv: StoreArgs) {
  store = new DataStore(leveldown(argv.store));
}
