import { copy, type CopyOptions } from "./copy";
import type * as S from "./data-store";
import { DataTape } from "./data-tape";

/** Accept packets into DataStore via bulk insertion protocol. */
export class BulkInsertTarget {
  public static create<InsertOptions extends {}>(
      store: S.Insert<InsertOptions>,
      opts?: CopyOptions & InsertOptions,
  ): BulkInsertTarget {
    return new BulkInsertTarget(store, opts);
  }

  private constructor(private readonly store: S.Insert<any>, private readonly opts?: any) {}

  /**
   * Accept bulk insertion from a stream of Data packets.
   * @param stream input stream.
   * @returns number of Data packets inserted.
   */
  public accept(stream: NodeJS.ReadableStream): Promise<number> {
    const src = new DataTape(stream);
    return copy(src, this.store, this.opts);
  }
}
