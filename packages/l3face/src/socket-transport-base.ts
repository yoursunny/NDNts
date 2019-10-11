import { pipeline, writeToStream } from "streaming-iterables";

export abstract class SocketTransportBase {
  constructor(protected readonly conn: NodeJS.ReadWriteStream) {
  }

  public tx = async (iterable: AsyncIterable<Uint8Array>): Promise<void> => {
    try {
      await pipeline(
        () => iterable,
        writeToStream(this.conn),
      );
    } finally {
      this.conn.end();
    }
  }
}
