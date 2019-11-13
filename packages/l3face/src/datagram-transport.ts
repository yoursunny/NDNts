import { rxFromPacketStream, txToStream } from "./rxtx";
import { Transport } from "./transport";

/** Datagram-oriented transport. */
export class DatagramTransport extends Transport {
  public readonly rx: Transport.Rx;
  public readonly tx: Transport.Tx;

  constructor(conn: NodeJS.ReadWriteStream, attrs: Record<string, any> = {}) {
    super(attrs);
    this.rx = rxFromPacketStream(conn);
    this.tx = txToStream(conn);
  }
}
