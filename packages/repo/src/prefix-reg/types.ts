import type { FwFace } from "@ndn/fw";

import type { DataStore } from "../data-store";

export interface PrefixRegContext {
  close: () => void;
}

type Face = Pick<FwFace, "addRoute"|"removeRoute">;

/** Control prefix registrations of a repo producer. */
export type PrefixRegController = (store: DataStore, face: Face) => PrefixRegContext;
