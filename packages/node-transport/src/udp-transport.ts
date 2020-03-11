import { rxFromPacketIterable, Transport } from "@ndn/l3face";
import * as dgram from "dgram";
import { EventIterator } from "event-iterator";
import { AddressInfo } from "net";

/** UDP socket transport. */
export class UdpTransport extends Transport {
  public readonly rx: Transport.Rx;

  public get laddr(): AddressInfo { return this.sock.address(); }
  public get raddr(): AddressInfo { return this.sock.remoteAddress(); }

  constructor(private readonly sock: dgram.Socket) {
    super({
      describe: `UDP(${sock.remoteAddress().address})`,
    });
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
  }

  public close() {
    try { this.sock.close(); } catch (err) {}
  }

  public tx = async (iterable: AsyncIterable<Uint8Array>): Promise<void> => {
    for await (const pkt of iterable) {
      this.sock.send(pkt);
    }
    this.close();
  };
}

export namespace UdpTransport {
  export interface TunnelOptions {
    host: string;
    port?: number;
    bind?: dgram.BindOptions;
    recvBufferSize?: number;
    sendBufferSize?: number;
  }

  export function connect(host: string, port?: number): Promise<UdpTransport>;

  export function connect(opts: TunnelOptions): Promise<UdpTransport>;

  export async function connect(arg1: string|TunnelOptions, port1?: number): Promise<UdpTransport> {
    const { host, port = 6363, bind = {}, recvBufferSize, sendBufferSize }: TunnelOptions =
      typeof arg1 === "string" ? { host: arg1, port: port1 } :
      arg1;
    return new Promise<UdpTransport>((resolve, reject) => {
      const sock = dgram.createSocket({
        type: "udp4",
        reuseAddr: true,
        recvBufferSize,
        sendBufferSize,
      });
      sock.on("error", reject);
      sock.on("connect", () => {
        sock.off("error", reject);
        resolve(new UdpTransport(sock));
      });
      sock.bind(bind, () => sock.connect(port, host));
    });
  }
}
