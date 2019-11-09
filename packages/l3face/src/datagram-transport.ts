import { rxFromPacketStream, txToStream } from "./rxtx";
import { Transport } from "./transport";

/** Datagram-oriented transport. */
export class DatagramTransport implements Transport {
  public readonly rx: Transport.Rx;
  public readonly tx: Transport.Tx;
  private describe: string;

  constructor(conn: NodeJS.ReadWriteStream, describe?: string) {
    this.rx = rxFromPacketStream(conn);
    this.tx = txToStream(conn);
    this.describe = describe ?? conn.constructor.name;
  }

  public toString() {
    return this.describe;
  }
}
