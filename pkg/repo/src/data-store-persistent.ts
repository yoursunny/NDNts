import { Level } from "level";

import { DataStore } from "./data-store";

/** Create a persistent DataStore with `level`. */
export function makePersistentDataStore(location: string): Promise<DataStore> {
  return DataStore.create(Level, location, {});
}
