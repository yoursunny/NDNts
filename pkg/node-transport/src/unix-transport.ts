import type { IpcSocketConnectOpts, Socket } from "node:net";

import { L3Face, StreamTransport } from "@ndn/l3face";

import { connectAndWaitConnected } from "./impl-net-connect";

/** Unix socket transport. */
export class UnixTransport extends StreamTransport<Socket> {
  /**
   * Create a transport and connect to remote endpoint.
   * @param path - Unix socket path or IPC options.
   * @see {@link UnixTransport.createFace}
   */
  public static async connect(path: string | IpcSocketConnectOpts): Promise<UnixTransport> {
    const connectOpts: IpcSocketConnectOpts = typeof path === "string" ? { path } : path;
    return new UnixTransport(
      await connectAndWaitConnected(connectOpts),
      connectOpts,
    );
  }

  private constructor(sock: Socket, private readonly connectOpts: IpcSocketConnectOpts) {
    super(sock, {
      describe: `Unix(${connectOpts.path})`,
      local: true,
    });
  }

  /** Reopen the transport by making a new connection with the same options. */
  public override reopen(): Promise<UnixTransport> {
    return UnixTransport.connect(this.connectOpts);
  }
}

export namespace UnixTransport {
  /** Create a transport and add to forwarder. */
  export const createFace = L3Face.makeCreateFace(UnixTransport.connect);
}
