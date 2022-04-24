import { L3Face, rxFromPacketIterable, Transport } from "@ndn/l3face";
import type { AddressInfo } from "node:net";
import { pEventIterator } from "p-event";

import { joinHostPort } from "./hostport";
import * as udp from "./udp-helper";

/** UDP socket transport. */
export class UdpTransport extends Transport {
  public override readonly rx: Transport.Rx;

  public readonly isMulticast: boolean;
  public readonly laddr: AddressInfo;
  public readonly raddr: AddressInfo;
  private readonly rxSock: udp.Socket;
  private readonly txSock: udp.Socket;

  constructor(unicast: udp.Socket);
  constructor(multicastTx: udp.Socket, multicastRx: udp.Socket);
  constructor(txSock: udp.Socket, rxSock?: udp.Socket) {
    super({
      describe: (() => {
        const [scheme, { address, port }] = rxSock ? ["UDPm", txSock.address()] : ["UDP", txSock.remoteAddress()];
        return `${scheme}(${joinHostPort(address, port)})`;
      })(),
      multicast: !!rxSock,
    });

    if (rxSock) {
      this.isMulticast = true;
      this.rxSock = rxSock;
      this.txSock = txSock;
      txSock.once("error", () => this.rxSock.close());
      this.laddr = this.txSock.address();
      this.raddr = this.rxSock.address();
    } else {
      this.isMulticast = false;
      this.rxSock = txSock;
      this.txSock = txSock;
      this.laddr = this.txSock.address();
      this.raddr = this.txSock.remoteAddress();
    }

    this.rx = rxFromPacketIterable(
      pEventIterator(this.rxSock, "message", {
        resolutionEvents: ["close"],
      }),
    );
  }

  public override get mtu() { return udp.DEFAULT_MTU; }

  public close() {
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
   * @param host remote host.
   * @param port remote port, default is 6363.
   */
  export function connect(host: string, port?: number): Promise<UdpTransport>;

  /** Create a unicast transport. */
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

  /** Create a multicast transport. */
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

  /** Create multicast transports on every interface. */
  export async function multicasts(opts: Omit<udp.MulticastOptions, "intf"> = {}): Promise<UdpTransport[]> {
    const intfs = udp.listMulticastIntfs();
    return (await Promise.allSettled(intfs.map((intf) => multicast({ ...opts, intf }))))
      .filter((res): res is PromiseFulfilledResult<UdpTransport> => res.status === "fulfilled")
      .map(({ value }) => value);
  }

  /** Create multicast transports on every interface. */
  export const createMulticastFaces = L3Face.makeCreateFace(multicasts);
}
