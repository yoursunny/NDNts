import type { AddressInfo } from "node:net";

import { L3Face, rxFromPacketIterable, Transport } from "@ndn/l3face";
import EventIterator from "event-iterator";
import type { Except } from "type-fest";

import { joinHostPort } from "./hostport";
import * as udp from "./udp-helper";

/** UDP socket transport. */
export class UdpTransport extends Transport {
  public override readonly rx: Transport.Rx;

  /** Local endpoint address. */
  public readonly laddr: AddressInfo;
  /** Remote endpoint or multicast group address. */
  public readonly raddr: AddressInfo;
  private readonly rxSock: udp.Socket;
  private readonly txSock: udp.Socket;

  /**
   * Constructor for unicast.
   *
   * @remarks
   * {@link UdpTransport.connect} and {@link UdpTransport.createFace} are recommended.
   */
  constructor(unicast: udp.Socket);

  /**
   * Constructor for multicast.
   *
   * @remarks
   * {@link UdpTransport.multicast} and {@link UdpTransport.createMulticastFace} are recommended.
   */
  constructor(multicastTx: udp.Socket, multicastRx: udp.Socket);

  constructor(txSock: udp.Socket, rxSock?: udp.Socket) {
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

  /**
   * Report MTU as 65487.
   * @see {@link https://superuser.com/a/1697822}
   */
  // https://github.com/typescript-eslint/typescript-eslint/issues/3602
  // eslint-disable-next-line @typescript-eslint/class-literal-property-style
  public override get mtu() { return 65487; }

  public close(): void {
    try {
      this.rxSock.close();
      if (this.txSock !== this.rxSock) {
        this.txSock.close();
      }
    } catch {}
  }

  public override readonly tx = async (iterable: AsyncIterable<Uint8Array>): Promise<void> => {
    try {
      for await (const pkt of iterable) {
        this.txSock.send(pkt);
      }
    } finally {
      this.close();
    }
  };
}

export namespace UdpTransport {
  /**
   * Create a unicast transport.
   * @param host - Remote host.
   * @param port - Remote port. Default is 6363.
   */
  export function connect(host: string, port?: number): Promise<UdpTransport>;

  /**
   * Create a unicast transport.
   * @param opts - Remote endpoint and other options.
   */
  export function connect(opts: udp.UnicastOptions): Promise<UdpTransport>;

  export function connect(arg1: string | udp.UnicastOptions, port?: number) {
    return connectImpl(arg1, port);
  }

  async function connectImpl(arg1: string | udp.UnicastOptions, port?: number): Promise<UdpTransport> {
    const opts = typeof arg1 === "string" ? { host: arg1, port } : arg1;
    const sock = await udp.openUnicast(opts);
    return new UdpTransport(sock);
  }

  /** Create a unicast transport and add to forwarder. */
  export const createFace = L3Face.makeCreateFace(connectImpl);

  /**
   * Create a multicast transport.
   * @param opts - Network interface and other options.
   */
  export async function multicast(opts: udp.MulticastOptions): Promise<UdpTransport> {
    const tx = await udp.openMulticastTx(opts);
    let rx: udp.Socket;
    try {
      rx = await udp.openMulticastRx(opts);
    } catch (err: unknown) {
      tx.close();
      throw err;
    }
    return new UdpTransport(tx, rx);
  }

  /** Create a multicast transport and add to forwarder. */
  export const createMulticastFace = L3Face.makeCreateFace(multicast);

  /** Create multicast transports on every multicast-capable netif. */
  export async function multicasts(opts: Except<udp.MulticastOptions, "intf"> = {}): Promise<UdpTransport[]> {
    const intfs = udp.listMulticastIntfs();
    return (await Promise.allSettled(intfs.map((intf) => multicast({ ...opts, intf }))))
      .filter((res): res is PromiseFulfilledResult<UdpTransport> => res.status === "fulfilled")
      .map(({ value }) => value);
  }

  /** Create multicast transports on every multicast-capable netif and add to forwarder. */
  export const createMulticastFaces = L3Face.makeCreateFace(multicasts);
}
