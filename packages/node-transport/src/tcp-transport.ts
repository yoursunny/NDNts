import net from "node:net";

import { L3Face, StreamTransport } from "@ndn/l3face";
import type { SetOptional } from "type-fest";

import { joinHostPort } from "./hostport";

const DEFAULT_PORT = 6363;

/** TCP socket transport. */
export class TcpTransport extends StreamTransport {
  /**
   * Constructor.
   *
   * @remarks
   * {@link TcpTransport.connect} and {@link TcpTransport.createFace} are recommended.
   */
  constructor(sock: net.Socket, private readonly connectOpts: net.TcpNetConnectOpts) {
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
  type NetConnectOpts = SetOptional<net.TcpNetConnectOpts, "port">;

  /** {@link connect} options. */
  export interface Options {
    /**
     * Connect timeout (in milliseconds).
     * @defaultValue 10 seconds
     */
    connectTimeout?: number;

    /** AbortSignal that allows canceling connection attempt via AbortController. */
    signal?: AbortSignal;
  }

  /**
   * Create a transport and connect to remote endpoint.
   * @param host - Remote host. Default is localhost.
   * @param port - Remote port. Default is 6363.
   */
  export function connect(host?: string, port?: number, opts?: Options): Promise<TcpTransport>;

  /**
   * Create a transport and connect to remote endpoint.
   * @param opts - Remote endpoint and other options.
   */
  export function connect(opts: NetConnectOpts & Options): Promise<TcpTransport>;

  export function connect(arg1?: string | (NetConnectOpts & Options), port?: number, opts?: Options) {
    return connectImpl(arg1, port, opts);
  }

  function connectImpl(
      arg1?: string | (NetConnectOpts & Options),
      port = DEFAULT_PORT,
      opts: Options = {},
  ): Promise<TcpTransport> {
    const connectOpts: net.TcpNetConnectOpts =
      arg1 === undefined ? { port } :
      typeof arg1 === "string" ? { host: arg1, port } :
      { host: arg1.host, port: arg1.port ?? DEFAULT_PORT, family: arg1.family };
    const {
      connectTimeout = 10000,
      signal,
    } = typeof arg1 === "object" ? arg1 : opts;

    return new Promise<TcpTransport>((resolve, reject) => {
      const sock = net.connect(connectOpts);
      sock.setNoDelay(true);

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
        resolve(new TcpTransport(sock, connectOpts));
      });
    });
  }

  /** Create a transport and add to forwarder. */
  export const createFace = L3Face.makeCreateFace(connectImpl);
}
