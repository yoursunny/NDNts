import { Decoder } from "@ndn/tlv";
import { fromStream, pipeline } from "streaming-iterables";

import { mapFilter } from "./internal";
import { SocketTransportBase } from "./socket-transport-base";
import { Transport } from "./transport";

/** Datagram-oriented transport. */
export class DatagramTransport extends SocketTransportBase implements Transport {
  public readonly rx: AsyncIterable<Decoder.Tlv>;

  constructor(conn: NodeJS.ReadWriteStream) {
    super(conn);
    this.rx = pipeline(
      () => fromStream<Uint8Array>(conn),
      mapFilter(this.decode),
    );
  }

  private decode = (packet: Uint8Array): Decoder.Tlv|undefined => {
    const decoder = new Decoder(packet);
    try {
      return decoder.read();
    } catch {
      // ignore error
    }
    return undefined;
  }
}
