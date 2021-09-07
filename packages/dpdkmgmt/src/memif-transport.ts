import { L3Face, rxFromPacketIterable, Transport, txToStream } from "@ndn/l3face";
import { Memif } from "memif";
import pEvent from "p-event";

/** Shared Memory Packet Interface (memif) transport. */
export class MemifTransport extends Transport {
  public override readonly rx: Transport.Rx;
  public override readonly tx: Transport.Tx;

  /**
   * Access the underlying Memif instance.
   * You may read its counters or add up/down event handlers, but not send/receive packets.
   */
  public readonly memif: Memif;

  constructor(opts: MemifTransport.Options) {
    super({
      describe: `Memif(${opts.socketName}:${opts.id ?? 0})`,
      local: true,
      multicast: false,
    });

    this.memif = new Memif(opts);
    this.rx = rxFromPacketIterable(this.memif);
    this.tx = txToStream(this.memif);
  }
}

export namespace MemifTransport {
  export type Options = Memif.Options;

  /** Create a memif transport. */
  export async function connect(opts: Options): Promise<MemifTransport> {
    const transport = new MemifTransport(opts);
    await pEvent(transport.memif, "up");
    return transport;
  }

  /** Create a memif transport and add to forwarder. */
  export const createFace = L3Face.makeCreateFace(connect);
}
