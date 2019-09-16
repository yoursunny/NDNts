import { Decoder } from "@ndn/tlv";
import { Readable, Writable } from "readable-stream";

import { Transport } from "./transport";

class MockRx extends Readable {
  constructor() {
    super({ objectMode: true });
  }

  public mockRx(pkt: Uint8Array) {
    const decoder = new Decoder(pkt);
    this.push(decoder.read());
  }

  public mockClose() {
    this.push(null);
  }
}

class MockTx extends Writable {
  public mockSent: Decoder[] = [];

  constructor() {
    super({ objectMode: true });
  }

  public _write(pkt: Uint8Array, encoding, callback: (error?: Error) => any) {
    this.mockSent.push(new Decoder(pkt));
    callback();
  }
}

export class MockTransport extends Transport<MockRx, MockTx> {
  constructor() {
    super(new MockRx(), new MockTx());
  }
}
