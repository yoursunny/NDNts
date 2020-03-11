import { StreamTransport } from "@ndn/l3face";
import * as net from "net";
import PCancelable from "p-cancelable";
import pTimeout from "p-timeout";

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
  export interface Options {
    /** Connect timeout (in milliseconds). */
    connectTimeout?: number;
  }

  export function connect(host?: string, port?: number, opts?: Options): Promise<TcpTransport>;

  export function connect(opts: net.TcpNetConnectOpts&Options): Promise<TcpTransport>;

  export function connect(arg1?: string|(net.TcpNetConnectOpts&Options), port = 6363,
      { connectTimeout = 10000 }: Options = {}): Promise<TcpTransport> {
    const connectOpts: net.TcpNetConnectOpts =
      typeof arg1 === "undefined" ? { port } :
      typeof arg1 === "string" ? { host: arg1, port } :
      { connectTimeout, ...arg1 };
    if (typeof arg1 === "object") {
      connectTimeout = arg1.connectTimeout ?? connectTimeout;
    }
    return pTimeout(new PCancelable<TcpTransport>((resolve, reject, onCancel) => {
      const sock = net.connect(connectOpts);
      sock.setNoDelay(true);
      sock.on("error", () => undefined);
      sock.once("error", reject);
      sock.once("connect", () => {
        sock.off("error", reject);
        resolve(new TcpTransport(sock, connectOpts));
      });
      onCancel(() => sock.destroy());
    }), connectTimeout);
  }
}
