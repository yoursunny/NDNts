import { L3Face, rxFromPacketIterable, Transport } from "@ndn/l3face";

interface WebTransport {
  readonly ready: Promise<void>;
  close(closeInfo?: unknown): void;

  // Chrome 91
  readonly datagramReadable?: ReadableStream<Uint8Array>;
  readonly datagramWritable?: WritableStream<Uint8Array>;

  // WD-webtransport-20210504
  readonly datagrams: {
    readonly readable: ReadableStream<Uint8Array>;
    readonly writable: WritableStream<Uint8Array>;
  };
}

/** HTTP3 transport. */
export class H3Transport extends Transport {
  public static async connect(uri: string): Promise<H3Transport> {
    const transport = new (globalThis as any).WebTransport(uri) as WebTransport;
    await transport.ready;
    return new H3Transport(uri, transport);
  }

  public readonly rx: Transport.Rx;
  private readonly datagramWriter: WritableStreamDefaultWriter<Uint8Array>;

  private constructor(
      uri: string,
      private readonly tr: WebTransport,
  ) {
    super({
      describe: `QUIC(${uri})`,
    });
    this.datagramWriter = (tr.datagramWritable ?? tr.datagrams.writable).getWriter();
    this.rx = rxFromPacketIterable((async function*() {
      const reader = (tr.datagramReadable ?? tr.datagrams.readable).getReader();
      for (;;) {
        const result = await reader.read();
        if (result.done) {
          break;
        }
        yield result.value;
      }
    })());
  }

  public tx = async (iterable: AsyncIterable<Uint8Array>): Promise<void> => {
    for await (const pkt of iterable) {
      await this.datagramWriter.write(pkt);
    }
    await this.datagramWriter.close();
    this.tr.close();
  };
}

export namespace H3Transport {
  /** Create a transport and add to forwarder. */
  export const createFace = L3Face.makeCreateFace(H3Transport.connect);
}
