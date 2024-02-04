import type { Socket, TcpSocketConnectOpts } from "node:net";

import { L3Face, StreamTransport } from "@ndn/l3face";
import type { SetOptional } from "type-fest";

import { joinHostPort } from "./hostport";
import { connectAndWaitConnected } from "./impl-net-connect";

/** TCP socket transport. */
export class TcpTransport extends StreamTransport<Socket> {
  /**
   * Create a transport and connect to remote endpoint.
   * @param host - Remote host (default is localhost) or endpoint address (with other options).
   * @param port - Remote port. Default is 6363.
   * @param opts - Other options.
   * @see {@link TcpTransport.createFace}
   */
  public static async connect(
      host?: string | (SetOptional<TcpSocketConnectOpts, "port"> & TcpTransport.Options),
      port = 6363,
      opts: TcpTransport.Options = {},
  ): Promise<TcpTransport> {
    const combined: TcpSocketConnectOpts & TcpTransport.Options = {
      port,
      noDelay: true,
      ...(typeof host === "string" ? { host } : host),
      ...opts,
    };

    return new TcpTransport(await connectAndWaitConnected(combined), combined);
  }

  private constructor(sock: Socket, private readonly connectOpts: TcpSocketConnectOpts) {
    super(sock, {
      describe: `TCP(${joinHostPort(sock.remoteAddress!, sock.remotePort!)})`,
      local: sock.localAddress === sock.remoteAddress,
    });
  }

  /** Reopen the transport by making a new connection with the same options. */
  public override reopen(): Promise<TcpTransport> {
    return TcpTransport.connect(this.connectOpts);
  }
}

export namespace TcpTransport {
  /** {@link TcpTransport.connect} options. */
  export interface Options {
    /**
     * Connect timeout (in milliseconds).
     * @defaultValue 10000
     */
    connectTimeout?: number;
  }

  /** Create a transport and add to forwarder. */
  export const createFace = L3Face.makeCreateFace(TcpTransport.connect);
}
