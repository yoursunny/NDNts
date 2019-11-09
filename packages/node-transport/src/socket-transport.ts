import { StreamTransport } from "@ndn/l3face";
import * as net from "net";

/** Stream-oriented socket transport. */
export class SocketTransport extends StreamTransport {
  public static async connect(opts: net.NetConnectOpts): Promise<SocketTransport> {
    return new Promise<SocketTransport>((resolve, reject) => {
      const sock = net.connect(opts);
      sock.once("error", reject);
      sock.once("connect", () => {
        sock.off("error", reject);
        resolve(new SocketTransport(sock));
      });
    });
  }

  constructor(sock: net.Socket) {
    super(sock, `Socket(${sock.remoteAddress})`);
  }
}
