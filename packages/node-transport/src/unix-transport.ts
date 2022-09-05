import * as net from "node:net";

import { L3Face, StreamTransport } from "@ndn/l3face";

/** Unix socket transport. */
export class UnixTransport extends StreamTransport {
  constructor(sock: net.Socket, private readonly connectOpts: net.IpcNetConnectOpts) {
    super(sock, {
      describe: `Unix(${connectOpts.path})`,
      local: true,
    });
  }

  public override reopen(): Promise<UnixTransport> {
    return UnixTransport.connect(this.connectOpts);
  }
}

export namespace UnixTransport {
  /**
   * Create a transport and connect to remote endpoint.
   * @param pathOrOpts Unix socket path.
   */
  export function connect(pathOrOpts: string | net.IpcNetConnectOpts): Promise<UnixTransport> {
    const connectOpts: net.IpcNetConnectOpts =
      typeof pathOrOpts === "string" ? { path: pathOrOpts } :
      pathOrOpts;
    return new Promise<UnixTransport>((resolve, reject) => {
      const sock = net.connect(connectOpts);
      sock.setNoDelay(true);
      sock.on("error", () => undefined);
      sock.once("error", reject);
      sock.once("connect", () => {
        sock.off("error", reject);
        resolve(new UnixTransport(sock, connectOpts));
      });
    });
  }

  /** Create a transport and add to forwarder. */
  export const createFace = L3Face.makeCreateFace(UnixTransport.connect);
}
