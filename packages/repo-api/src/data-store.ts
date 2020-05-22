import type { Data, Interest, Name } from "@ndn/packet";

/** Data packet store. */
export interface DataStore {
  /** Close the store. */
  close: () => Promise<void>;

  /** List Data names, optionally filtered by name prefix. */
  listNames: (prefix?: Name) => AsyncIterable<Name>;

  /** List Data packets, optionally filtered by name prefix. */
  listData: (prefix?: Name) => AsyncIterable<Data>;

  /** Retrieve Data by exact name. */
  get: (name: Name) => Promise<Data|undefined>;

  /** Find Data that satisfies Interest. */
  find: (interest: Interest) => Promise<Data|undefined>;

  /** Insert one or more Data packets. */
  insert: (...pkts: Data[]) => Promise<void>;

  /** Delete Data packets with given names. */
  delete: (...names: Name[]) => Promise<void>;
}
