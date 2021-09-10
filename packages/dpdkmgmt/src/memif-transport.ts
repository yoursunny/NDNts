import { L3Face, rxFromPacketIterable, Transport, txToStream } from "@ndn/l3face";
import { Memif } from "memif";
import pEvent from "p-event";

/** Shared Memory Packet Interface (memif) transport. */
export class MemifTransport extends Transport {
  public override readonly rx: Transport.Rx;
  public override readonly tx: Transport.Tx;

  /**
   * Access the underlying Memif instance.
   * You may read counters and monitor "memif:up" "memif:down" events, but not send/receive packets.
   */
  public readonly memif: Memif;

  constructor(opts: MemifTransport.Options, memif: Memif) {
    super({
      describe: `Memif(${opts.socketName}:${opts.id ?? 0})`,
      local: true,
      multicast: false,
      mtu: Math.min(memif.dataroom, opts.dataroom ?? Infinity),
    });

    this.memif = memif;
    this.rx = rxFromPacketIterable(this.memif);
    this.tx = txToStream(this.memif);
  }
}

export namespace MemifTransport {
  export interface Options extends Memif.Options {
    /**
     * Whether to wait until the connection is up.
     * Default is true;
     */
    waitUp?: boolean;
  }

  /** Create a memif transport. */
  export async function connect(opts: Options): Promise<MemifTransport> {
    const {
      waitUp = true,
    } = opts;
    const transport = new MemifTransport(opts, new Memif(opts));
    if (waitUp) {
      await pEvent(transport.memif, "memif:up");
    }
    return transport;
  }

  /** Create a memif transport and add to forwarder. */
  export const createFace = L3Face.makeCreateFace(connect);
}
