import { type Encodable, Decoder, Encoder } from "@ndn/tlv";
import { abortableSource, AbortError as IteratorAbortError } from "abortable-iterator";
import { pushable } from "it-pushable";
import { consume, pipeline, tap } from "streaming-iterables";

import { Transport } from "..";

export class MockTransport extends Transport {
  public override readonly rx = pushable<Decoder.Tlv>();
  public sent: Uint8Array[] = [];
  private readonly closing = new AbortController();

  constructor(attributes: Transport.Attributes = {}) {
    super(attributes);
  }

  public recv(pkt: Encodable) {
    const tlv = new Decoder(Encoder.encode(pkt)).read();
    this.rx.push(tlv);
  }

  public close(err?: Error) {
    this.rx.end(err);
    this.closing.abort();
  }

  public override readonly tx = async (iterable: AsyncIterable<Uint8Array>) => {
    try {
      await pipeline(
        () => abortableSource(iterable, this.closing.signal),
        tap((pkt) => this.send(pkt)),
        consume,
      );
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
