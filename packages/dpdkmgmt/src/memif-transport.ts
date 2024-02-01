import { once } from "node:events";

import { L3Face, rxFromPacketIterable, Transport, txToStream } from "@ndn/l3face";
import type { Memif } from "memif";

/** Shared Memory Packet Interface (memif) transport. */
export class MemifTransport extends Transport {
  /** Create a transport and establish connection. */
  public static async connect(opts: MemifTransport.Options): Promise<MemifTransport> {
    const {
      waitUp = true,
    } = opts;

    const MemifConstructor: typeof Memif = (await import("memif")).Memif;
    const transport = new MemifTransport(opts, new MemifConstructor(opts));

    if (waitUp) {
      await once(transport.memif, "memif:up");
    }
    return transport;
  }

  private constructor(opts: MemifTransport.Options, memif: Memif) {
    super({
      describe: `Memif(${opts.socketName}:${opts.id ?? 0})`,
      local: true,
      multicast: false,
    });

    this.memif = memif;
    this.mtu_ = Math.min(memif.dataroom, opts.dataroom ?? Infinity);
    this.rx = rxFromPacketIterable(this.memif);
  }

  /**
   * Access the underlying Memif instance.
   *
   * @remarks
   * You may read counters and monitor "memif:up" "memif:down" events, but not send/receive packets.
   */
  public readonly memif: Memif;
  private readonly mtu_: number;

  public override get mtu() { return this.mtu_; }

  public override readonly rx: Transport.RxIterable;

  public override async tx(iterable: Transport.TxIterable) {
    return txToStream(this.memif, iterable);
  }
}

export namespace MemifTransport {
  /** {@link MemifTransport.connect} options. */
  export interface Options extends Memif.Options {
    /**
     * Whether to wait until the connection is up.
     * @defaultValue true
     */
    waitUp?: boolean;
  }

  /** Create a memif transport and add to forwarder. */
  export const createFace = L3Face.makeCreateFace(MemifTransport.connect);
}
