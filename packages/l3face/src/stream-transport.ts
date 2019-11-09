import { rxFromContinuousStream, txToStream } from "./rxtx";
import { Transport } from "./transport";

/** Stream-oriented transport. */
export class StreamTransport implements Transport {
  public readonly rx: Transport.Rx;
  public readonly tx: Transport.Tx;
  private describe: string;

  constructor(conn: NodeJS.ReadWriteStream, describe?: string) {
    this.rx = rxFromContinuousStream(conn);
    this.tx = txToStream(conn);
    this.describe = describe ?? conn.constructor.name;
  }

  public toString() {
    return this.describe;
  }
}
