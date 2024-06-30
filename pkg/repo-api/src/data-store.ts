import { Data, type Interest, type Name } from "@ndn/packet";
import type { AnyIterable } from "streaming-iterables";

/** DataStore interface, listNames method. */
export interface ListNames {
  /** List Data names, optionally filtered by name prefix. */
  listNames: (prefix?: Name) => AsyncIterable<Name>;
}

/** DataStore interface, listData method. */
export interface ListData {
  /** List Data packets, optionally filtered by name prefix. */
  listData: (prefix?: Name) => AsyncIterable<Data>;
}

/** DataStore interface, get method. */
export interface Get {
  /** Retrieve Data by exact name. */
  get: (name: Name) => Promise<Data | undefined>;
}

/** DataStore interface, find method. */
export interface Find {
  /** Find Data that satisfies Interest. */
  find: (interest: Interest) => Promise<Data | undefined>;
}

/** DataStore interface, insert method. */
export interface Insert<Options extends {} = {}> {
  /**
   * Insert one or more Data packets.
   *
   * @remarks
   * Arguments include:
   * - an optional Options object
   * - zero or more Data, Iterable<Data>, or AsyncIterable<Data>
   */
  insert: (...args: Insert.Args<Options>) => Promise<void>;
}
export namespace Insert {
  type Tail = ReadonlyArray<Data | AnyIterable<Data>>;
  export type Args<O extends {}> = [...(object extends O ? [O] | [] : []), ...Tail];

  export interface ParsedArgs<O> {
    readonly opts?: O;
    readonly pkts: AsyncIterable<Data>;
    readonly singles: Data[];
    readonly batches: Array<AnyIterable<Data>>;
  }

  /** Normalize {@link Insert.insert} arguments. */
  export function parseArgs<O extends {}>(args: Args<O>): ParsedArgs<O> {
    let opts: O | undefined;
    if (args.length > 0 && !(args[0] instanceof Data || (args[0] as Iterable<Data>)[Symbol.iterator] ||
        (args[0] as AsyncIterable<Data>)[Symbol.asyncIterator])) {
      opts = args.shift() as O;
    }
    return {
      opts,
      get pkts() {
        return (async function*() {
          for (const a of args as Tail) {
            if (a instanceof Data) {
              yield a;
            } else {
              yield* a;
            }
          }
        })();
      },
      get singles() {
        return args.filter((a) => a instanceof Data);
      },
      get batches() {
        return args.filter((a): a is AnyIterable<Data> => !(a instanceof Data));
      },
    };
  }
}

/** DataStore interface, delete method. */
export interface Delete {
  /** Delete Data packets with given names. */
  delete: (...names: readonly Name[]) => Promise<void>;
}
