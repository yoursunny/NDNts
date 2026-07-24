export { DataStore, Transaction } from "./data-store";
export { makeInMemoryDataStore } from "./data-store-memory";
export { makePersistentDataStore } from "./data-store-persistent";
export * from "./prefix-reg/mod";
export { RepoProducer } from "./producer";

import { metadataFallback } from "./metadata-fallback";

export {
  metadataFallback,
  /** @deprecated Use `metadataFallback` instead. */
  metadataFallback as respondRdr,
};
