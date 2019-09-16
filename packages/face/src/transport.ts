export class Transport<RX extends NodeJS.ReadableStream = NodeJS.ReadableStream,
                       TX extends NodeJS.WritableStream = NodeJS.WritableStream> {
  public get rx(): RX {
    return this.rx_;
  }

  public get tx(): TX {
    return this.tx_;
  }

  constructor(private rx_: RX, private tx_: TX) {
  }
}
