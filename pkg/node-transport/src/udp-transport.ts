import dgram from "node:dgram";
import type { AddressInfo } from "node:net";

import { L3Face, rxFromPacketIterable, Transport } from "@ndn/l3face";
import EventIterator from "event-iterator";
import type { Except } from "type-fest";

import { joinHostPort } from "./hostport";
import * as udp from "./udp-helper";

/** UDP socket transport. */
export class UdpTransport extends Transport {
  /**
   * Create a unicast transport.
   * @param host - Remote host or endpoint address (with other options) or existing socket.
   * @param port - Remote port. Default is 6363.
   * @see {@link UdpTransport.createFace}
   */
  public static async connect(host: string | udp.UnicastOptions | dgram.Socket, port?: number) {
    if (typeof host === "string") {
      host = { host };
    }
    const sock = host instanceof dgram.Socket ? host : await udp.openUnicast({ port, ...host });
    return new UdpTransport(sock);
  }

  /**
   * Create a multicast transport.
   * @param opts - Network interface and other options.
   * @see {@link UdpTransport.createMulticastFace}
   */
  public static async multicast(opts: udp.MulticastOptions): Promise<UdpTransport> {
    const tx = await udp.openMulticastTx(opts);
    let rx: dgram.Socket;
    try {
      rx = await udp.openMulticastRx(opts);
    } catch (err: unknown) {
      tx.close();
      throw err;
    }
    return new UdpTransport(tx, rx);
  }

  private constructor(unicast: dgram.Socket);
  private constructor(multicastTx: dgram.Socket, multicastRx: dgram.Socket);
  private constructor(txSock: dgram.Socket, rxSock?: dgram.Socket) {
    const [scheme, { address, port }] = rxSock ? ["UDPm", txSock.address()] : ["UDP", txSock.remoteAddress()];
    super({
      describe: `${scheme}(${joinHostPort(address, port)})`,
      multicast: !!rxSock,
    });

    if (rxSock) {
      this.rxSock = rxSock;
      this.txSock = txSock;
      txSock.once("error", () => this.rxSock.close());
      this.laddr = this.txSock.address();
      this.raddr = this.rxSock.address();
    } else {
      this.rxSock = txSock;
      this.txSock = txSock;
      this.laddr = this.txSock.address();
      this.raddr = this.txSock.remoteAddress();
    }

    this.rx = rxFromPacketIterable(
      new EventIterator<Uint8Array>(({ push, stop, fail }) => {
        const handleMessage = (msg: Uint8Array) => push(msg);
        this.rxSock.on("message", handleMessage);
        this.rxSock.on("close", stop);
        this.rxSock.on("error", fail);
        return () => {
          this.rxSock.off("message", handleMessage);
          this.rxSock.off("close", stop);
          this.rxSock.off("error", fail);
        };
      }),
    );
  }

  /** Local endpoint address. */
  public readonly laddr: AddressInfo;
  /** Remote endpoint or multicast group address. */
  public readonly raddr: AddressInfo;
  private readonly rxSock: dgram.Socket;
  private readonly txSock: dgram.Socket;

  /**
   * Report MTU as 65487.
   * @see {@link https://superuser.com/a/1697822}
   */
  // https://github.com/typescript-eslint/typescript-eslint/issues/3602
  // eslint-disable-next-line @typescript-eslint/class-literal-property-style
  public override get mtu() { return 65487; }

  public override readonly rx: Transport.RxIterable;

  public override async tx(iterable: Transport.TxIterable) {
    try {
      for await (const pkt of iterable) {
        this.txSock.send(pkt);
      }
    } finally {
      this.close();
    }
  }

  public close(): void {
    try {
      this.rxSock.close();
      if (this.txSock !== this.rxSock) {
        this.txSock.close();
      }
    } catch {}
  }
}

export namespace UdpTransport {
  /** Create a unicast transport and add to forwarder. */
  export const createFace = L3Face.makeCreateFace(UdpTransport.connect);

  /** Create a multicast transport and add to forwarder. */
  export const createMulticastFace = L3Face.makeCreateFace(UdpTransport.multicast);

  /** Create multicast transports on every multicast-capable netif. */
  export async function multicasts(opts: Except<udp.MulticastOptions, "intf"> = {}): Promise<UdpTransport[]> {
    const intfs = udp.listMulticastIntfs();
    return (await Promise.allSettled(intfs.map((intf) => UdpTransport.multicast({ ...opts, intf }))))
      .filter((res) => res.status === "fulfilled")
      .map(({ value }) => value);
  }

  /** Create multicast transports on every multicast-capable netif and add to forwarder. */
  export const createMulticastFaces = L3Face.makeCreateFace(multicasts);
}
