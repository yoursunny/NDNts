import { Decoder } from "@ndn/tlv";
import { fromStream, pipeline } from "streaming-iterables";

import { SocketTransportBase } from "./socket-transport-base";
import { Transport } from "./transport";

/** Stream-oriented transport. */
export class StreamTransport extends SocketTransportBase implements Transport {
  public readonly rx: AsyncIterable<Decoder.Tlv>;

  constructor(conn: NodeJS.ReadWriteStream) {
    super(conn);
    this.rx = pipeline(
      () => fromStream<Buffer>(conn),
      this.decode,
    );
  }

  private async *decode(iterable: AsyncIterable<Buffer>): AsyncIterable<Decoder.Tlv> {
    let leftover = Buffer.alloc(0);
    for await (const chunk of iterable) {
      if (leftover.length > 0) {
        leftover = Buffer.concat([leftover, chunk], leftover.length + chunk.length);
      } else {
        leftover = chunk;
      }
      const decoder = new Decoder(leftover);
      let consumed = 0;
      while (true) {
        let tlv: Decoder.Tlv;
        try {
          tlv = decoder.read();
        } catch (ex) {
          break;
        }
        yield tlv;
        consumed += tlv.size;
      }
      if (consumed > 0) {
        leftover = leftover.subarray(consumed);
      }
    }
  }
}
