import type { Name } from "@ndn/packet";
import { assert } from "@ndn/util";

import type { DataStore } from "../data-store";
import type { PrefixRegController } from "./types";

/**
 * Register prefixes derived from Data names.
 * @param transform - Function that accepts Data name and returns registered prefix name.
 * It must be a pure function i.e. returns the same value for the same argument.
 *
 * @remarks
 * Warning: this may misbehave when {@link DataStore.InsertOptions.expireTime} is being used.
 */
export function PrefixRegDynamic(transform: (name: Name) => Name): PrefixRegController {
  return (store, face) => {
    const handleInsertName = (name: Name) => {
      const prefix = transform(name);
      face.addRoute(prefix);
    };
    const handleInsert = ({ name }: DataStore.RecordEvent) => {
      handleInsertName(name);
    };
    const handleDelete = ({ name }: DataStore.RecordEvent) => {
      const prefix = transform(name);
      face.removeRoute(prefix);
    };

    void store.mutex.use(async () => {
      for await (const name of store.listNames()) {
        handleInsertName(name);
      }
    });
    store.addEventListener("insert", handleInsert);
    store.addEventListener("delete", handleDelete);
    return {
      close() {
        store.removeEventListener("insert", handleInsert);
        store.removeEventListener("delete", handleDelete);
      },
    };
  };
}

/**
 * Register prefixes k components shorter than Data names.
 * @param k - Number of final name components to strip.
 *
 * @remarks
 * Warning: this may misbehave when {@link DataStore.InsertOptions.expireTime} is being used.
 */
export function PrefixRegShorter(k: number): PrefixRegController {
  assert(k >= 0);
  return PrefixRegDynamic((name) => name.getPrefix(-k));
}
