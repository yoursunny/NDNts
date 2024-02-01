import { L3Face, rxFromPacketIterable, Transport } from "@ndn/l3face";

/** HTTP/3 transport. */
export class H3Transport extends Transport {
  /** Whether current browser supports WebTransport. */
  public static readonly supported: boolean = !!globalThis.WebTransport;

  /**
   * Create a transport and connect to remote endpoint.
   * @param uri - Server URI.
   * @param opts - WebTransport options.
   */
  public static async connect(uri: string, opts: WebTransportOptions = {}): Promise<H3Transport> {
    const tr = new WebTransport(uri, opts);
    void tr.closed.catch(() => undefined);
    await tr.ready;
    return new H3Transport(uri, opts, tr);
  }

  private constructor(
      private readonly uri: string,
      private readonly opts: WebTransportOptions,
      private readonly tr: WebTransport,
  ) {
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

  /** Report HTTP/3 maximum datagram size as MTU. */
  public override get mtu() {
    return this.tr.datagrams.maxDatagramSize;
  }

  public override readonly rx: Transport.RxIterable;

  public override async tx(iterable: Transport.TxIterable) {
    const writer = this.tr.datagrams.writable.getWriter();
    try {
      for await (const pkt of iterable) {
        await writer.write(pkt);
      }
      await writer.close();
    } finally {
      this.tr.close();
    }
  }

  /** Reopen the transport by connecting again with the same options. */
  public override reopen() {
    return H3Transport.connect(this.uri, this.opts);
  }
}

export namespace H3Transport {
  /** Create a transport and add to forwarder. */
  export const createFace = L3Face.makeCreateFace(H3Transport.connect);
}
