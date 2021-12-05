import { L3Face, rxFromPacketIterable, Transport } from "@ndn/l3face";

interface WebTransport {
  readonly ready: Promise<void>;
  readonly closed: Promise<WebTransportCloseInfo>;
  close(closeInfo?: Partial<WebTransportCloseInfo>): void;
  readonly datagrams: WebTransportDatagramDuplexStream;
}

interface WebTransportCloseInfo {
  closeCode: number;
  reason: string;
}

interface WebTransportDatagramDuplexStream {
  readonly readable: ReadableStream<Uint8Array>;
  readonly writable: WritableStream<Uint8Array>;
  readonly maxDatagramSize: number;
}

/** HTTP/3 transport. */
export class H3Transport extends Transport {
  /** Whether current browser supports WebTransport. */
  public static supported = !!(globalThis as any).WebTransport;

  public override readonly rx: Transport.Rx;

  constructor(private readonly uri: string, private readonly tr: WebTransport) {
    super({
      describe: `QUIC(${uri})`,
    });
    this.rx = rxFromPacketIterable((async function*() {
      const reader = tr.datagrams.readable.getReader();
      while (true) {
        const result = await reader.read();
        if (result.done) {
          break;
        }
        yield result.value;
      }
    })());
  }

  public override readonly tx = async (iterable: AsyncIterable<Uint8Array>): Promise<void> => {
    const writer = this.tr.datagrams.writable.getWriter();
    try {
      for await (const pkt of iterable) {
        await writer.write(pkt);
      }
      await writer.close();
    } finally {
      this.tr.close();
    }
  };

  public override reopen() {
    return H3Transport.connect(this.uri);
  }
}

export namespace H3Transport {
  /**
   * Create a transport and connect to remote endpoint.
   * @param uri server URI.
   */
  export async function connect(uri: string): Promise<H3Transport> {
    const tr = new (globalThis as any).WebTransport(uri) as WebTransport;
    tr.closed.catch(() => undefined); // eslint-disable-line promise/prefer-await-to-then
    await tr.ready;
    return new H3Transport(uri, tr);
  }

  /** Create a transport and add to forwarder. */
  export const createFace = L3Face.makeCreateFace(H3Transport.connect);
}
