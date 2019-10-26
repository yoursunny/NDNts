import { pipeline, writeToStream } from "streaming-iterables";

export abstract class SocketTransportBase {

  private describe: string;
  constructor(protected readonly conn: NodeJS.ReadWriteStream,
              describe?: string) {
    this.describe = describe ?? conn.constructor.name;
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

  public toString() {
    return this.describe;
  }
}
