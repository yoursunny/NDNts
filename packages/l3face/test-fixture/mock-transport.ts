import { Decoder, Encodable, Encoder } from "@ndn/tlv";
import pushable from "it-pushable";
import pDefer from "p-defer";

import { Transport } from "..";

export class MockTransport extends Transport {
  public readonly rx = pushable<Decoder.Tlv>();
  public sent: Uint8Array[] = [];
  private closePromise = pDefer<undefined>();

  constructor(attributes: Transport.Attributes = {}) {
    super(attributes);
  }

  public recv(pkt: Encodable) {
    const tlv = new Decoder(Encoder.encode(pkt)).read();
    this.rx.push(tlv);
  }

  public close(err?: Error) {
    this.rx.end(err);
    if (err) {
      this.closePromise.reject(err);
    } else {
      this.closePromise.resolve(undefined);
    }
  }

  public readonly tx = async (iterable: AsyncIterable<Uint8Array>) => {
    const iterator = iterable[Symbol.asyncIterator]();
    while (true) {
      const pkt = await Promise.race([
        iterator.next(),
        this.closePromise.promise,
      ]);
      if (!pkt || pkt.done) { // normal close
        return;
      }
      this.sent.push(pkt.value);
    }
  }
}
