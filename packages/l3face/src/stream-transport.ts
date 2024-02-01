import { rxFromStream, txToStream } from "./rxtx-stream";
import { Transport } from "./transport";

/** Node.js stream-based transport. */
export class StreamTransport<T extends NodeJS.ReadWriteStream = NodeJS.ReadWriteStream> extends Transport {
  constructor(protected readonly conn: T, attrs: Record<string, unknown> = {}) {
    super(attrs);
    this.rx = rxFromStream(conn);
  }

  /** Report MTU as Infinity. */
  public override get mtu() { return Infinity; }

  public override readonly rx: Transport.RxIterable;

  public override tx(iterable: Transport.TxIterable) {
    return txToStream(this.conn, iterable);
  }
}
