import { L3Face, StreamTransport } from "@ndn/l3face";
import { Data, Interest, Name } from "@ndn/packet";
import duplexify from "duplexify";
import { readable as isReadable, writable as isWritable } from "is-stream";
import pDefer from "p-defer";
import type { Readable, Writable } from "stream";
import { consume, filter, map, pipeline } from "streaming-iterables";

import * as S from "./data-store";
import { makeOpenFileStreamFunction } from "./data-tape-file_node";

/**
 * DataTape is a file or stream that consists of a sequence of Data packets.
 * This type implements DataStore interfaces on top of such a file or stream.
 */
export class DataTape implements DataTape.Reader, DataTape.Writer {
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
  constructor(stream: NodeJS.ReadableStream|NodeJS.WritableStream|DataTape.OpenStream|string) {
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
            throw new Error("stream can be used only once");
          }
          used = true;
          return stream;
        };
        break;
      }
    }
  }

  private readonly makeStream: (mode: DataTape.StreamMode) => NodeJS.ReadableStream|NodeJS.WritableStream;

  private makeReader(): Reader {
    const stream = this.makeStream("read");
    if (!isReadable(stream)) {
      throw new Error("stream is not Readable");
    }
    return new Reader(stream);
  }

  private makeWriter(): Writer {
    const stream = this.makeStream("append");
    if (!isWritable(stream)) {
      throw new Error("stream is not Writable");
    }
    return new Writer(stream);
  }

  public listNames(prefix?: Name): AsyncIterable<Name> {
    return this.makeReader().listNames(prefix);
  }

  public listData(prefix?: Name): AsyncIterable<Data> {
    return this.makeReader().listData(prefix);
  }

  public get(name: Name): Promise<Data|undefined> {
    return this.makeReader().get(name);
  }

  public find(interest: Interest): Promise<Data|undefined> {
    return this.makeReader().find(interest);
  }

  public insert(...args: S.Insert.Args<{}>): Promise<void> {
    return this.makeWriter().insert(...args);
  }
}

class Reader implements DataTape.Reader {
  constructor(private readonly stream: NodeJS.ReadableStream) {}

  private used = false;

  private open(): [reader: AsyncIterable<Data>, close: () => void] {
    if (this.used) {
      throw new Error("Reader can be used only once");
    }
    this.used = true;

    const duplex = duplexify(undefined, this.stream as Readable);
    const defer = pDefer<void>();
    const close = () => defer.resolve();
    duplex.on("end", close);

    const face = new L3Face(new StreamTransport(duplex));

    // eslint-disable-next-line @typescript-eslint/no-floating-promises, require-yield
    face.tx((async function*() {
      await defer.promise;
    })());

    const rx = pipeline(
      () => face.rx,
      map((pkt) => pkt.l3),
      filter((pkt): pkt is Data => pkt instanceof Data),
    );
    return [rx, close];
  }

  public listNames(prefix?: Name): AsyncIterable<Name> {
    return map((data) => data.name, this.listData(prefix));
  }

  public async *listData(prefix?: Name): AsyncIterable<Data> {
    const [reader, close] = this.open();
    try {
      for await (const data of reader) {
        if (!prefix || prefix.isPrefixOf(data.name)) {
          yield data;
        }
      }
    } finally {
      close();
    }
  }

  private async findFirst(predicate: (data: Data) => boolean|Promise<boolean>): Promise<Data|undefined> {
    const [reader, close] = this.open();
    try {
      for await (const data of reader) {
        if (await predicate(data)) {
          return data;
        }
      }
      return undefined;
    } finally {
      close();
    }
  }

  public get(name: Name): Promise<Data|undefined> {
    return this.findFirst((data) => data.name.equals(name));
  }

  public find(interest: Interest): Promise<Data|undefined> {
    return this.findFirst((data) => data.canSatisfy(interest));
  }
}

class Writer implements DataTape.Writer {
  constructor(private readonly stream: NodeJS.WritableStream) {}

  private used = false;

  private open(): [writer: (tx: AsyncIterable<Data>) => Promise<void>] {
    if (this.used) {
      throw new Error("Reader can be used only once");
    }
    this.used = true;

    const duplex = duplexify(this.stream as Writable, undefined);
    const face = new L3Face(new StreamTransport(duplex));
    consume(face.rx).catch(() => undefined);

    return [(pkts) => face.tx(map((l3) => ({ l3 }), pkts)).finally(() => duplex.end())];
  }

  public insert(...args: S.Insert.Args<{}>): Promise<void> {
    const { pkts } = S.Insert.parseArgs<{}>(args);
    const [writer] = this.open();
    return writer(pkts);
  }
}

export namespace DataTape {
  export type StreamMode = "read"|"append";
  export type OpenStream = (mode: StreamMode) => NodeJS.ReadableStream|NodeJS.WritableStream;

  export interface Reader extends S.ListNames, S.ListData, S.Get, S.Find {}
  export interface Writer extends S.Insert {}
}
