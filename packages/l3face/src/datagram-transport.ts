import { Decoder } from "@ndn/tlv";
import { filter, fromStream, map, pipeline } from "streaming-iterables";

import { SocketTransportBase } from "./socket-transport-base";
import { Transport } from "./transport";

/** Datagram-oriented transport. */
export class DatagramTransport extends SocketTransportBase implements Transport {
  public readonly rx: AsyncIterable<Decoder.Tlv>;

  constructor(conn: NodeJS.ReadWriteStream, describe?: string) {
    super(conn, describe);
    this.rx = pipeline(
      () => fromStream<Uint8Array>(conn),
      map(this.decode),
      filter((item): item is Decoder.Tlv => !!item),
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
