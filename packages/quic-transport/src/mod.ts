import { L3Face, rxFromPacketIterable, Transport } from "@ndn/l3face";

/** QUIC transport. */
export class QuicTransport extends Transport {
  public static async connect(uri: string): Promise<QuicTransport> {
    const transport = new (globalThis as any).QuicTransport(uri);
    await transport.ready;
    return new QuicTransport(uri, transport);
  }

  public readonly rx: Transport.Rx;
  private readonly datagramWriter: WritableStreamDefaultWriter;

  private constructor(
      uri: string,
      transport: any,
  ) {
    super({
      describe: `QUIC(${uri})`,
    });
    this.datagramWriter = transport.sendDatagrams().getWriter();
    this.rx = rxFromPacketIterable((async function*() {
      const reader = transport.receiveDatagrams().getReader() as ReadableStreamDefaultReader;
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
  };
}

export namespace QuicTransport {
  /** Create a transport and add to forwarder. */
  export const createFace = L3Face.makeCreateFace(QuicTransport.connect);
}
