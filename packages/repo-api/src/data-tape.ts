import { L3Face, StreamTransport } from "@ndn/l3face";
import { type Interest, type Name, Data } from "@ndn/packet";
import duplexify from "duplexify";
import { isReadableStream, isWritableStream } from "is-stream";
import { type Pushable, pushable } from "it-pushable";
import pDefer, { type DeferredPromise } from "p-defer";
import { consume, filter, map, pipeline } from "streaming-iterables";
import throat from "throat";

import * as S from "./data-store";
import { makeOpenFileStreamFunction } from "./data-tape-file_node";

interface WriteItem {
  pkts: AsyncIterable<Data>;
  done: DeferredPromise<void>;
}

/**
 * DataTape is a file or stream that consists of a sequence of Data packets.
 * This type implements DataStore interfaces on top of such a file or stream.
 */
export class DataTape implements S.Close, S.ListNames, S.ListData, S.Get, S.Find, S.Insert {
  /**
   * Constructor.
   * @param stream a readable/writable stream, a function to (re)open the stream, or a filename.
   *
   * If stream is a stream (instead of a function or a filename), only one method may be called once.
   * Otherwise, methods can be called, but they must be sequenced because this type is non-thread-safe.
   *
   * DataTape.Reader methods are available only if the stream is readable.
   * DataTape.Writer methods are available only if the stream is writable.
   */
  constructor(stream: NodeJS.ReadableStream | NodeJS.WritableStream | DataTape.OpenStream | string) {
    switch (typeof stream) {
      case "function":
        this.makeStream = stream;
        break;
      case "string":
        this.makeStream = makeOpenFileStreamFunction(stream);
        break;
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
  private readonly mutex = throat(1);
  private currentWriter?: [L3Face, Pushable<WriteItem>];

  private async closeCurrentWriter() {
    if (!this.currentWriter) {
      return;
    }
    const [face, tx] = this.currentWriter;
    tx.end();
    await new Promise<void>((r) => face.once("close", r));
    this.currentWriter = undefined;
  }

  private async useReader<R>(cb: (reader: AsyncIterable<Data>) => Promise<R>): Promise<R> {
    let result: any;
    await this.mutex(async () => {
      await this.closeCurrentWriter();

      const stream = this.makeStream("read");
      if (!isReadableStream(stream)) {
        throw new Error("stream is not Readable");
      }

      const duplex = duplexify(undefined, stream);
      const defer = pDefer<void>();
      const close = () => defer.resolve();
      duplex.once("end", close);

      const face = new L3Face(new StreamTransport(duplex));
      // eslint-disable-next-line require-yield
      void face.tx((async function*() { await defer.promise; })());

      const reader = pipeline(
        () => face.rx,
        map((pkt) => pkt.l3),
        filter((pkt): pkt is Data => pkt instanceof Data),
      );

      try {
        result = await cb(reader);
      } finally {
        close();
      }
    });
    return result;
  }

  private async useWriter(cb: (write: (pkts: AsyncIterable<Data>) => Promise<void>) => Promise<void>) {
    await this.mutex(async () => {
      if (!this.currentWriter) {
        const stream = this.makeStream("append");
        if (!isWritableStream(stream)) {
          throw new Error("stream is not Writable");
        }

        const duplex = duplexify(stream, undefined);
        const face = new L3Face(new StreamTransport(duplex));
        consume(face.rx).catch(() => undefined);

        const tx = pushable<WriteItem>();
        face.tx((async function*() {
          for await (const item of tx) {
            try {
              yield* map((l3) => ({ l3 }), item.pkts);
            } catch (err: unknown) {
              item.done.reject(err);
              return;
            }
            item.done.resolve();
          }
        })()).then(() => duplex.end(), () => undefined);

        this.currentWriter = [face, tx];
      }

      await cb(async (pkts) => {
        const item = {
          pkts,
          done: pDefer<void>(),
        };
        const [, tx] = this.currentWriter!;
        tx.push(item);
        await item.done.promise;
      });
    });
  }

  public listNames(prefix?: Name): AsyncIterable<Name> {
    return map((data) => data.name, this.listData(prefix));
  }

  public listData(prefix?: Name): AsyncIterable<Data> {
    const output = pushable<Data>();
    void (async () => {
      try {
        await this.useReader(async (reader) => {
          for await (const data of reader) {
            if (!prefix || prefix.isPrefixOf(data.name)) {
              output.push(data);
            }
          }
        });
      } catch (err: unknown) {
        output.end(err as Error);
        return;
      }
      output.end();
    })();
    return output;
  }

  private async findFirst(predicate: (data: Data) => boolean | Promise<boolean>): Promise<Data | undefined> {
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

  public close(): Promise<void> {
    return this.closeCurrentWriter();
  }

  public insert(...args: S.Insert.Args<{}>): Promise<void> {
    const { pkts } = S.Insert.parseArgs<{}>(args);
    return this.useWriter((write) => write(pkts));
  }
}

export namespace DataTape {
  export type StreamMode = "read" | "append";
  export type OpenStream = (mode: StreamMode) => NodeJS.ReadableStream | NodeJS.WritableStream;
}
