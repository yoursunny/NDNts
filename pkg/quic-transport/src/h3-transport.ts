import { L3Face, rxFromPacketIterable, Transport } from "@ndn/l3face";
import { delay } from "@ndn/util";

import { makeWebTransport, supported } from "./wt_node";

/** HTTP/3 transport. */
export class H3Transport extends Transport {
  /** Whether current environment supports WebTransport. */
  public static readonly supported: boolean = supported;

  /**
   * Create a transport and connect to remote endpoint.
   * @param uri - Server URI.
   * @param opts - WebTransport options.
   */
  public static async connect(uri: string, opts: H3Transport.Options = {}): Promise<H3Transport> {
    const { connectTimeout = 10000, ...wtOpts } = opts;
    const tr = makeWebTransport(uri, wtOpts);
    void tr.closed.catch(() => undefined); // eslint-disable-line promise/prefer-await-to-then
    const isTimeout = await Promise.race([
      tr.ready,
      delay(connectTimeout, true),
    ]);
    if (isTimeout) {
      tr.close();
      throw new Error("timeout");
    }
    return new H3Transport(uri, opts, tr);
  }

  private constructor(
      private readonly uri: string,
      private readonly opts: H3Transport.Options,
      private readonly tr: WebTransport,
  ) {
    super({
      describe: `H3(${uri})`,
    });
    this.rx = rxFromPacketIterable((async function*() {
      const reader = tr.datagrams.readable.getReader();
      try {
        while (true) {
          const result = await reader.read();
          if (result.done) {
            break;
          }
          yield result.value;
        }
      } finally {
        reader.releaseLock();
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
  /** {@link H3Transport.connect} options. */
  export interface Options extends WebTransportOptions {
    /**
     * Connect timeout (in milliseconds).
     * @defaultValue 10000
     */
    connectTimeout?: number;

    /**
     * Skip TLS certificate verification (Node.js only).
     * @defaultValue false
     *
     * @remarks
     * `serverCertificateHashes` does not work in Node.js due to @webtransport-bun/webtransport
     * v0.3.0 bugs but would be supported when they release v1.0.
     */
    insecureSkipVerify?: boolean;
  }

  /** Create a transport and add to forwarder. */
  export const createFace = L3Face.makeCreateFace(H3Transport.connect);
}
