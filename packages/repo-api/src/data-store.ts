import type { Data, Interest, Name } from "@ndn/packet";

export interface Close {
  /** Close the store. */
  close: () => Promise<void>;
}

export interface ListNames {
  /** List Data names, optionally filtered by name prefix. */
  listNames: (prefix?: Name) => AsyncIterable<Name>;
}

export interface ListData {
  /** List Data packets, optionally filtered by name prefix. */
  listData: (prefix?: Name) => AsyncIterable<Data>;
}

export interface Get {
  /** Retrieve Data by exact name. */
  get: (name: Name) => Promise<Data|undefined>;
}

export interface Find {
  /** Find Data that satisfies Interest. */
  find: (interest: Interest) => Promise<Data|undefined>;
}

type InsertFunc = (...pkts: Data[]) => Promise<void>;

export interface Insert<Options = never> {
  /** Insert one or more Data packets. */
  insert: object extends Options ? ((opts: Options, ...pkts: Data[]) => Promise<void>) | InsertFunc : InsertFunc;
}

export interface Delete {
  /** Delete Data packets with given names. */
  delete: (...names: Name[]) => Promise<void>;
}
