import { MemoryLevel } from "memory-level";

import { DataStore } from "./data-store";

/** Create an in-memory DataStore with `memory-level`. */
export function makeInMemoryDataStore(): Promise<DataStore> {
  return DataStore.create(MemoryLevel, { storeEncoding: "view" });
}
