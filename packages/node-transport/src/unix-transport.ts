import net from "node:net";

import { L3Face, StreamTransport } from "@ndn/l3face";

/** Unix socket transport. */
export class UnixTransport extends StreamTransport<net.Socket> {
  /**
   * Create a transport and connect to remote endpoint.
   * @param path - Unix socket path or IPC options.
   * @see {@link UdpTransport.createFace}
   */
  public static connect(path: string | net.IpcSocketConnectOpts): Promise<UnixTransport> {
    const connectOpts: net.IpcNetConnectOpts = typeof path === "string" ? { path } : path;
    return new Promise<UnixTransport>((resolve, reject) => {
      const sock = net.connect(connectOpts);
      sock.on("error", () => undefined);
      sock.once("error", reject);
      sock.once("connect", () => {
        sock.off("error", reject);
        resolve(new UnixTransport(sock, connectOpts));
      });
    });
  }

  private constructor(sock: net.Socket, private readonly connectOpts: net.IpcNetConnectOpts) {
    super(sock, {
      describe: `Unix(${connectOpts.path})`,
      local: true,
    });
  }

  /** Reopen the transport by connecting again with the same options. */
  public override reopen(): Promise<UnixTransport> {
    return UnixTransport.connect(this.connectOpts);
  }
}

export namespace UnixTransport {
  /** Create a transport and add to forwarder. */
  export const createFace = L3Face.makeCreateFace(UnixTransport.connect);
}
