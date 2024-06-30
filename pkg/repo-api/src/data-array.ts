import type { Data, Interest, Name } from "@ndn/packet";
import { collect, filter, map, pipeline, take } from "streaming-iterables";

import * as S from "./data-store";

/**
 * Data packet storage based on array.
 *
 * @remarks
 * This is a minimal implementation of DataStore interfaces. It has small code size but every
 * operation has O(N) time complexity.
 */
export class DataArray implements S.ListNames, S.ListData, S.Get, S.Find, S.Insert, S.Delete {
  private array: Data[] = [];

  public listNames(prefix?: Name): AsyncIterable<Name> {
    return map((data) => data.name, this.listData(prefix));
  }

  public async *listData(prefix?: Name): AsyncIterable<Data> {
    if (prefix === undefined) {
      yield* this.array;
    } else {
      yield* filter((data) => prefix.isPrefixOf(data.name), this.array);
    }
  }

  public async get(name: Name): Promise<Data | undefined> {
    return this.array.find((data) => name.equals(data.name));
  }

  public async find(interest: Interest): Promise<Data | undefined> {
    const [found] = await pipeline(
      () => this.array,
      filter((data: Data) => data.canSatisfy(interest)),
      take(1),
      collect,
    );
    return found;
  }

  public async insert(...args: S.Insert.Args<{}>): Promise<void> {
    const { pkts } = S.Insert.parseArgs<{}>(args);
    this.array.push(...await collect(pkts));
  }

  public async delete(...names: readonly Name[]): Promise<void> {
    this.array = this.array.filter((data) => !names.some((name) => name.equals(data.name)));
  }
}
