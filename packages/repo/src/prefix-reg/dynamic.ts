import type { Name } from "@ndn/packet";
import { assert } from "@ndn/util";

import type { DataStore } from "../data-store";
import type { PrefixRegController } from "./types";

/**
 * Register prefixes derived from Data names.
 * @param transform a function that accepts Data name and returns registered prefix name;
 *                  it must return the same value for the same argument.
 *
 * Warning: this may misbehave when expireTime option is being used.
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

    void store.mutex(async () => {
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

/** Register prefixes k components shorter than Data names. */
export function PrefixRegShorter(k: number): PrefixRegController {
  assert(k >= 0);
  return PrefixRegDynamic((name) => name.getPrefix(-k));
}
