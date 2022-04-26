import { L3Face, rxFromPacketIterable, Transport, txToStream } from "@ndn/l3face";
import type { Memif } from "memif";
import { createRequire } from "node:module";
import { pEvent } from "p-event";

// don't name this 'require' to avoid @typescript-eslint/no-require-imports
const cjsRequire = createRequire(import.meta.url);

/** Shared Memory Packet Interface (memif) transport. */
export class MemifTransport extends Transport {
  public override readonly rx: Transport.Rx;
  public override readonly tx: Transport.Tx;

  /**
   * Access the underlying Memif instance.
   * You may read counters and monitor "memif:up" "memif:down" events, but not send/receive packets.
   */
  public readonly memif: Memif;
  private readonly mtu_: number;

  constructor(opts: MemifTransport.Options, memif: Memif) {
    super({
      describe: `Memif(${opts.socketName}:${opts.id ?? 0})`,
      local: true,
      multicast: false,
    });

    this.memif = memif;
    this.mtu_ = Math.min(memif.dataroom, opts.dataroom ?? Infinity);
    this.rx = rxFromPacketIterable(this.memif);
    this.tx = txToStream(this.memif);
  }

  public override get mtu() { return this.mtu_; }
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

    const MemifConstructor: typeof Memif = cjsRequire("memif").Memif;
    const transport = new MemifTransport(opts, new MemifConstructor(opts));

    if (waitUp) {
      await pEvent(transport.memif, "memif:up");
    }
    return transport;
  }

  /** Create a memif transport and add to forwarder. */
  export const createFace = L3Face.makeCreateFace(connect);
}
