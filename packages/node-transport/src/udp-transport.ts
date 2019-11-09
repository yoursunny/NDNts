import { rxFromPacketIterable, Transport } from "@ndn/l3face";
import * as dgram from "dgram";
import * as dgram12 from "dgram12"; // dgram typing for Node 12, until https://github.com/DefinitelyTyped/DefinitelyTyped/pull/40263 is merged
import { EventIterator } from "event-iterator";
import { AddressInfo } from "net";

/** UDP socket transport. */
export class UdpTransport implements Transport {
  public static async connect({
    port: port = 6363,
    host, bind, recvBufferSize, sendBufferSize,
  }: UdpTransport.TunnelOptions): Promise<UdpTransport> {
    return new Promise<UdpTransport>((resolve, reject) => {
      const sock = dgram.createSocket({
        type: "udp4",
        reuseAddr: true,
        recvBufferSize,
        sendBufferSize,
      }) as dgram12.Socket;
      sock.on("error", reject);
      sock.on("connect", () => {
        sock.off("error", reject);
        resolve(new UdpTransport(sock));
      });
      sock.bind(bind ?? {}, () => sock.connect(port, host));
    });
  }

  public readonly rx: Transport.Rx;
  private readonly describe: string;

  public get laddr(): AddressInfo { return this.sock.address(); }
  public get raddr(): AddressInfo { return this.sock.remoteAddress(); }

  constructor(private readonly sock: dgram12.Socket) {
    this.rx = rxFromPacketIterable(new EventIterator<Uint8Array>(
      (push, stop, fail) => {
        sock.addListener("message", push);
        sock.addListener("close", stop);
        sock.addListener("error", fail);
      },
      (push, stop, fail) => {
        sock.removeListener("message", push);
        sock.removeListener("close", stop);
        sock.removeListener("error", fail);
      },
    ));
    this.describe = `UDP(${this.raddr.address})`;
  }

  public close() {
    try { this.sock.close(); }
    catch (err) {}
  }

  public tx = async (iterable: AsyncIterable<Uint8Array>): Promise<void> => {
    for await (const pkt of iterable) {
      this.sock.send(pkt);
    }
    this.close();
  }

  public toString() {
    return this.describe;
  }
}

export namespace UdpTransport {
  export interface TunnelOptions {
    host: string;
    port?: number;
    bind?: dgram12.BindOptions;
    recvBufferSize?: number;
    sendBufferSize?: number;
  }
}
