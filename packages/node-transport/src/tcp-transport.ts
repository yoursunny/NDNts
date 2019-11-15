import { StreamTransport } from "@ndn/l3face";
import * as net from "net";

/** TCP socket transport. */
export class TcpTransport extends StreamTransport {
  constructor(sock: net.Socket, private readonly connectOpts: net.TcpNetConnectOpts) {
    super(sock, {
      describe: `TCP(${sock.remoteAddress}:${sock.remotePort})`,
      local: sock.localAddress === sock.remoteAddress,
    });
  }

  public reopen(): Promise<TcpTransport> {
    return TcpTransport.connect(this.connectOpts);
  }
}

export namespace TcpTransport {
  export function connect(host?: string, port?: number): Promise<TcpTransport>;

  export function connect(connectOpts: net.TcpNetConnectOpts): Promise<TcpTransport>;

  export function connect(arg1?: string|net.TcpNetConnectOpts, port: number = 6363): Promise<TcpTransport> {
    const connectOpts: net.TcpNetConnectOpts =
      typeof arg1 === "undefined" ? { port } :
      typeof arg1 === "string" ? { host: arg1, port } :
      arg1;
    return new Promise<TcpTransport>((resolve, reject) => {
      const sock = net.connect(connectOpts);
      sock.setNoDelay(true);
      sock.once("error", reject);
      sock.once("connect", () => {
        sock.off("error", reject);
        resolve(new TcpTransport(sock, connectOpts));
      });
    });
  }
}
