import { Decoder, type Encodable, Encoder } from "@ndn/tlv";
import { abortableSource, AbortError as IteratorAbortError } from "abortable-iterator";
import { pushable } from "it-pushable";

import { Transport } from "..";

export class MockTransport extends Transport {
  public override readonly rx = pushable<Decoder.Tlv>({ objectMode: true });
  public sent: Uint8Array[] = [];
  private readonly closing = new AbortController();

  constructor(attributes: Transport.Attributes = {}) {
    super(attributes);
  }

  public recv(pkt: Encodable) {
    const wire = Encoder.encode(pkt);
    const decoder = new Decoder(wire);
    const tlv = decoder.read();
    this.rx.push(tlv);
    decoder.throwUnlessEof();
  }

  public close(err?: Error) {
    this.rx.end(err);
    this.closing.abort();
  }

  public override readonly tx = async (iterable: AsyncIterable<Uint8Array>) => {
    try {
      for await (const pkt of abortableSource(iterable, this.closing.signal)) {
        this.send(pkt);
      }
    } catch (err: unknown) {
      if (!(err instanceof IteratorAbortError)) {
        throw err;
      }
    }
  };

  protected send(pkt: Uint8Array): void {
    this.sent.push(pkt);
  }
}
