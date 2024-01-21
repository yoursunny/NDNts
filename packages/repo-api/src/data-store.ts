import { Data, type Interest, type Name } from "@ndn/packet";
import type { AnyIterable } from "streaming-iterables";

export interface Close {
  /** Close the store. */
  close(): Promise<void>;
}

export interface ListNames {
  /** List Data names, optionally filtered by name prefix. */
  listNames(prefix?: Name): AsyncIterable<Name>;
}

export interface ListData {
  /** List Data packets, optionally filtered by name prefix. */
  listData(prefix?: Name): AsyncIterable<Data>;
}

export interface Get {
  /** Retrieve Data by exact name. */
  get(name: Name): Promise<Data | undefined>;
}

export interface Find {
  /** Find Data that satisfies Interest. */
  find(interest: Interest): Promise<Data | undefined>;
}

export interface Insert<Options extends {} = {}> {
  /**
   * Insert one or more Data packets.
   *
   * Arguments include:
   * - an optional Options object
   * - zero or more Data, Iterable<Data>, or AsyncIterable<Data>
   */
  insert(...args: Insert.Args<Options>): Promise<void>;
}
export namespace Insert {
  export type Args<O extends {}> = [...(object extends O ? [O] | [] : []), ...ReadonlyArray<Data | AnyIterable<Data>>];

  export interface ParsedArgs<O> {
    readonly opts?: O;
    readonly pkts: AsyncIterable<Data>;
    readonly singles: Data[];
    readonly batches: Array<AnyIterable<Data>>;
  }

  export function parseArgs<O extends {}>(args: Args<O>): ParsedArgs<O> {
    let opts: O | undefined;
    if (args.length > 0 && !(args[0] instanceof Data) && !isDataIterable(args[0])) {
      opts = args.shift() as O;
    }
    return {
      opts,
      get pkts() {
        return (async function*() {
          for (const a of args) {
            if (isDataIterable(a)) {
              yield* a;
            } else {
              yield a as Data;
            }
          }
        })();
      },
      get singles() {
        return args.filter((a): a is Data => a instanceof Data);
      },
      get batches() {
        return args.filter(isDataIterable);
      },
    };
  }

  function isDataIterable(obj: any): obj is AnyIterable<Data> {
    return !!obj && (!!(obj as Iterable<Data>)[Symbol.iterator] || !!(obj as AsyncIterable<Data>)[Symbol.asyncIterator]);
  }
}

export interface Delete {
  /** Delete Data packets with given names. */
  delete(...names: readonly Name[]): Promise<void>;
}
