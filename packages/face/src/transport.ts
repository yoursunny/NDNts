import { Readable, Writable } from "readable-stream";

export class Transport<RX extends NodeJS.ReadableStream = Readable,
                       TX extends NodeJS.WritableStream = Writable> {
  public get rx(): RX {
    return this.rx_;
  }

  public get tx(): TX {
    return this.tx_;
  }

  constructor(private rx_: RX, private tx_: TX) {
  }
}
