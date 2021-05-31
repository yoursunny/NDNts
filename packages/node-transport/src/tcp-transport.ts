import { L3Face, StreamTransport } from "@ndn/l3face";
import type { AbortSignal } from "abort-controller";
import * as net from "net";

import { joinHostPort } from "./hostport";

const DEFAULT_PORT = 6363;

/** TCP socket transport. */
export class TcpTransport extends StreamTransport {
  constructor(sock: net.Socket, private readonly connectOpts: net.TcpNetConnectOpts) {
    super(sock, {
      describe: `TCP(${joinHostPort(sock.remoteAddress!, sock.remotePort!)})`,
      local: sock.localAddress === sock.remoteAddress,
    });
  }

  public reopen(): Promise<TcpTransport> {
    return TcpTransport.connect(this.connectOpts);
  }
}

export namespace TcpTransport {
  export type NetConnectOpts = Omit<net.TcpNetConnectOpts, "port"> & Partial<Pick<net.TcpNetConnectOpts, "port">>;

  export interface Options {
    /** Connect timeout (in milliseconds). */
    connectTimeout?: number;

    /** AbortSignal that allows canceling connection attempt via AbortController. */
    signal?: AbortSignal | globalThis.AbortSignal;
  }

  /**
   * Create a transport and connect to remote endpoint.
   * @param host remote host, default is "localhost".
   * @param port remote port, default is 6363.
   * @param opts other options.
   */
  export function connect(host?: string, port?: number, opts?: Options): Promise<TcpTransport>;

  /**
   * Create a transport and connect to remote endpoint.
   * @param opts remote endpoint and other options.
   */
  export function connect(opts: NetConnectOpts & Options): Promise<TcpTransport>;

  export function connect(arg1?: string | (NetConnectOpts & Options), port = DEFAULT_PORT,
      opts: Options = {}): Promise<TcpTransport> {
    const connectOpts: net.TcpNetConnectOpts =
      typeof arg1 === "undefined" ? { port } :
      typeof arg1 === "string" ? { host: arg1, port } :
      { host: arg1.host, port: arg1.port ?? DEFAULT_PORT, family: arg1.family };
    const {
      connectTimeout = 10000,
      signal,
    } = typeof arg1 === "object" ? arg1 : opts;

    return new Promise<TcpTransport>((resolve, reject) => {
      const sock = net.connect(connectOpts);
      sock.setNoDelay(true);

      const fail = (err?: Error) => {
        sock.destroy();
        reject(err);
      };
      const timeout = setTimeout(() => fail(new Error("connectTimeout")), connectTimeout);

      const onabort = () => fail(new Error("abort"));
      (signal as AbortSignal | undefined)?.addEventListener("abort", onabort);

      sock.on("error", () => undefined);
      sock.once("error", fail);
      sock.once("connect", () => {
        clearTimeout(timeout);
        sock.off("error", fail);
        (signal as AbortSignal | undefined)?.removeEventListener("abort", onabort);
        resolve(new TcpTransport(sock, connectOpts));
      });
    });
  }

  /** Create a transport and add to forwarder. */
  export const createFace = L3Face.makeCreateFace(TcpTransport.connect);
}
