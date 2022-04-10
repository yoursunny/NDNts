import { rxFromStream, txToStream } from "./rxtx-stream";
import { Transport } from "./transport";

/** Stream-oriented transport. */
export class StreamTransport extends Transport {
  public override readonly rx: Transport.Rx;
  public override readonly tx: Transport.Tx;

  constructor(conn: NodeJS.ReadWriteStream, attrs: Record<string, any> = {}) {
    super(attrs);
    this.rx = rxFromStream(conn);
    this.tx = txToStream(conn);
  }

  public override get mtu() { return Infinity; }
}
