import { rxFromStream } from "@ndn/l3face";
import { Data, type Interest, type Name } from "@ndn/packet";
import { Encoder } from "@ndn/tlv";
import { assert, lock } from "@ndn/util";
import { isReadableStream, isWritableStream } from "is-stream";
import { pEvent } from "p-event";
import { filter, map, pipeline, writeToStream } from "streaming-iterables";
import type { Promisable } from "type-fest";
import { Mutex } from "wait-your-turn";

import * as S from "./data-store";
import { makeOpenFileStreamFunction } from "./data-tape-file_node";

/**
 * DataTape is a file or stream that consists of a sequence of Data packets.
 * This type implements DataStore interfaces on top of such a file or stream.
 */
export class DataTape implements DataTape.Reader, DataTape.Writer {
  /**
   * Constructor.
   * @param stream - Stream or how to open the stream.
   *
   * @remarks
   * `stream` could be:
   * - a readable/writable stream;
   * - a function to (re)open the stream;
   * - a filename.
   *
   * {@link DataTape.Reader} methods are available only if the stream is readable.
   * {@link DataTape.Writer} methods are available only if the stream is writable.
   *
   * If `stream` is a stream instance, it allows either one read or multiple writes.
   * If `stream` is an opener function or filename, it allows multiple reads and writes.
   * Function calls must be sequenced because this type is non-thread-safe.
   */
  constructor(stream: NodeJS.ReadableStream | NodeJS.WritableStream | DataTape.OpenStream | string) {
    switch (typeof stream) {
      case "function": {
        this.makeStream = stream;
        break;
      }
      case "string": {
        this.makeStream = makeOpenFileStreamFunction(stream);
        break;
      }
      default: {
        let used = false;
        this.makeStream = () => {
          if (used) {
            throw new Error("cannot reopen stream");
          }
          used = true;
          return stream;
        };
        break;
      }
    }
  }

  private readonly makeStream: (mode: DataTape.StreamMode) => NodeJS.ReadableStream | NodeJS.WritableStream;
  private readonly mutex = new Mutex();
  private currentWriter?: NodeJS.WritableStream;

  private async closeCurrentWriter() {
    if (!this.currentWriter) {
      return;
    }
    this.currentWriter.end();
    await pEvent(this.currentWriter, "finish");
    this.currentWriter = undefined;
  }

  private async useReader<R>(cb: (reader: AsyncIterable<Data>) => Promisable<R>): Promise<R> {
    // @ts-expect-error https://github.com/microsoft/TypeScript/issues/55538
    using locked = await lock(this.mutex);
    await this.closeCurrentWriter();

    const stream = this.makeStream("read");
    assert(isReadableStream(stream), "stream is not Readable");

    return await pipeline(
      () => rxFromStream(stream),
      map(({ decoder }) => {
        try {
          return decoder.decode(Data);
        } catch {
          return undefined;
        }
      }),
      filter((data): data is Data => data instanceof Data),
      cb,
    );
  }

  private async useWriter(cb: (write: (pkts: AsyncIterable<Data>) => Promise<void>) => Promise<void>) {
    // @ts-expect-error https://github.com/microsoft/TypeScript/issues/55538
    using locked = await lock(this.mutex);
    this.currentWriter ??= this.makeStream("append") as NodeJS.WritableStream;
    assert(isWritableStream(this.currentWriter), "stream is not Writable");

    await cb((pkts) => pipeline(
      () => pkts,
      map((pkt) => Encoder.encode(pkt)),
      writeToStream(this.currentWriter!),
    ));
  }

  public listNames(prefix?: Name): AsyncIterable<Name> {
    return map((data) => data.name, this.listData(prefix));
  }

  public async *listData(prefix?: Name): AsyncIterable<Data> {
    yield* await this.useReader(async function*(reader): AsyncGenerator<Data> {
      for await (const data of reader) {
        if (!prefix || prefix.isPrefixOf(data.name)) {
          yield data;
        }
      }
    });
  }

  private async findFirst(predicate: (data: Data) => Promisable<boolean>): Promise<Data | undefined> {
    return this.useReader(async (reader) => {
      for await (const data of reader) {
        if (await predicate(data)) {
          return data;
        }
      }
      return undefined;
    });
  }

  public get(name: Name): Promise<Data | undefined> {
    return this.findFirst((data) => data.name.equals(name));
  }

  public find(interest: Interest): Promise<Data | undefined> {
    return this.findFirst((data) => data.canSatisfy(interest));
  }

  public insert(...args: S.Insert.Args<{}>): Promise<void> {
    const { pkts } = S.Insert.parseArgs<{}>(args);
    return this.useWriter((write) => write(pkts));
  }

  public [Symbol.asyncDispose](): Promise<void> {
    return this.closeCurrentWriter();
  }
}

export namespace DataTape {
  /** Desired mode of opening a stream. */
  export type StreamMode = "read" | "append";

  /** Function to open a stream for use by DataTape. */
  export type OpenStream = (mode: StreamMode) => NodeJS.ReadableStream | NodeJS.WritableStream;

  /** Interface of {@link DataTape} read operations. */
  export type Reader = S.ListNames & S.ListData & S.Get & S.Find & AsyncDisposable;

  /** Interface of {@link DataTape} write operations. */
  export type Writer = S.Insert & AsyncDisposable;
}
