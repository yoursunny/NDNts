import net from "node:net";

import { L3Face, StreamTransport } from "@ndn/l3face";
import type { SetOptional } from "type-fest";

import { joinHostPort } from "./hostport";

/** TCP socket transport. */
export class TcpTransport extends StreamTransport<net.Socket> {
  /**
   * Create a transport and connect to remote endpoint.
   * @param host - Remote host (default is localhost) or endpoint address (with other options).
   * @param port - Remote port. Default is 6363.
   * @param opts - Other options.
   * @see {@link TcpTransport.createFace}
   */
  public static connect(
      host?: string | (SetOptional<net.TcpSocketConnectOpts, "port"> & TcpTransport.Options),
      port = 6363,
      opts: TcpTransport.Options = {},
  ): Promise<TcpTransport> {
    const combined: net.TcpSocketConnectOpts & TcpTransport.Options = {
      port,
      noDelay: true,
      ...(typeof host === "string" ? { host } : host),
      ...opts,
    };
    const { connectTimeout = 10000, signal } = combined;

    return new Promise<TcpTransport>((resolve, reject) => {
      const sock = net.connect(combined);

      let timeout: NodeJS.Timeout | undefined; // eslint-disable-line prefer-const
      const fail = (err?: Error) => {
        clearTimeout(timeout);
        sock.destroy();
        reject(err);
      };
      timeout = setTimeout(() => fail(new Error("connectTimeout")), connectTimeout);

      const onabort = () => fail(new Error("abort"));
      signal?.addEventListener("abort", onabort);

      sock.on("error", () => undefined);
      sock.once("error", fail);
      sock.once("connect", () => {
        clearTimeout(timeout);
        sock.off("error", fail);
        signal?.removeEventListener("abort", onabort);
        resolve(new TcpTransport(sock, combined));
      });
    });
  }

  private constructor(sock: net.Socket, private readonly connectOpts: net.TcpSocketConnectOpts) {
    super(sock, {
      describe: `TCP(${joinHostPort(sock.remoteAddress!, sock.remotePort!)})`,
      local: sock.localAddress === sock.remoteAddress,
    });
  }

  /** Reopen the transport by connecting again with the same options. */
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

    /** AbortSignal that allows canceling connection attempt via AbortController. */
    signal?: AbortSignal;
  }

  /** Create a transport and add to forwarder. */
  export const createFace = L3Face.makeCreateFace(TcpTransport.connect);
}
