import type { Name } from "@ndn/packet";
import type { Closer } from "@ndn/util";

import type { DataStore } from "../data-store";

interface Face {
  addRoute: (name: Name) => void;
  removeRoute: (name: Name) => void;
}

/** Control prefix registrations of a repo producer. */
export type PrefixRegController = (store: DataStore, face: Face) => Closer;
