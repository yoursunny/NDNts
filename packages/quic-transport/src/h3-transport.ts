import { L3Face, rxFromPacketIterable, Transport } from "@ndn/l3face";

/** HTTP/3 transport. */
export class H3Transport extends Transport {
  /** Whether current browser supports WebTransport. */
  public static readonly supported: boolean = !!globalThis.WebTransport;

  public override readonly rx: Transport.Rx;

  constructor(private readonly uri: string, private readonly tr: WebTransport) {
    super({
      describe: `H3(${uri})`,
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

  public override get mtu() {
    return this.tr.datagrams.maxDatagramSize;
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
    const tr = new WebTransport(uri);
    void tr.closed.catch(() => undefined);
    await tr.ready;
    return new H3Transport(uri, tr);
  }

  /** Create a transport and add to forwarder. */
  export const createFace = L3Face.makeCreateFace(H3Transport.connect);
}
