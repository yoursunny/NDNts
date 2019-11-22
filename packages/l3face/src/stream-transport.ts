import { rxFromStream, Transport, txToStream } from "./mod";

/** Stream-oriented transport. */
export class StreamTransport extends Transport {
  public readonly rx: Transport.Rx;
  public readonly tx: Transport.Tx;

  constructor(conn: NodeJS.ReadWriteStream, attrs: Record<string, any> = {}) {
    super(attrs);
    this.rx = rxFromStream(conn);
    this.tx = txToStream(conn);
  }
}
