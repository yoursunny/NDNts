import { L3Face, rxFromPacketIterable, Transport } from "@ndn/l3face";
import type { AbortSignal } from "abort-controller";
import pEvent from "p-event";
import { map } from "streaming-iterables";
import type WsWebSocket from "ws";

import { makeWebSocket } from "./ws_node";

/** WebSocket transport. */
export class WsTransport extends Transport {
  public override readonly rx: Transport.Rx;
  private readonly highWaterMark: number;
  private readonly lowWaterMark: number;

  constructor(private readonly sock: WebSocket, private readonly opts: WsTransport.Options) {
    super({ describe: `WebSocket(${sock.url})` });
    sock.binaryType = "arraybuffer";
    this.rx = rxFromPacketIterable(map(
      (evt) => new Uint8Array(evt instanceof ArrayBuffer ? evt : evt.data),
      pEvent.iterator<"message", ArrayBuffer | MessageEvent<ArrayBuffer>>(
        sock, "message", { resolutionEvents: ["close"] }),
    ));

    this.highWaterMark = opts.highWaterMark ?? 1024 * 1024;
    this.lowWaterMark = opts.lowWaterMark ?? 16 * 1024;
  }

  public close() {
    this.sock.close();
  }

  public override readonly tx = async (iterable: AsyncIterable<Uint8Array>): Promise<void> => {
    try {
      for await (const pkt of iterable) {
        if (this.sock.readyState !== this.sock.OPEN) {
          throw new Error(`unexpected WebSocket.readyState ${this.sock.readyState}`);
        }
        this.sock.send(pkt);

        if (this.sock.bufferedAmount > this.highWaterMark) {
          await this.waitForTxBuffer();
        }
      }
    } finally {
      this.close();
    }
  };

  private waitForTxBuffer(): Promise<void> {
    return new Promise((resolve) => {
      const timer = setInterval(() => {
        if (this.sock.bufferedAmount <= this.lowWaterMark || this.sock.readyState !== this.sock.OPEN) {
          clearInterval(timer);
          resolve();
        }
      }, 100);
    });
  }

  public override reopen() {
    return WsTransport.connect(this.sock.url, this.opts);
  }
}

export namespace WsTransport {
  export interface Options {
    /** Connect timeout (in milliseconds). */
    connectTimeout?: number;

    /** AbortSignal that allows canceling connection attempt via AbortController. */
    signal?: AbortSignal | globalThis.AbortSignal;

    /** Buffer amount (in bytes) to start TX throttling. */
    highWaterMark?: number;

    /** Buffer amount (in bytes) to stop TX throttling. */
    lowWaterMark?: number;
  }

  /**
   * Create a transport and connect to remote endpoint.
   * @param uri server URI or WebSocket object.
   * @param opts other options.
   */
  export function connect(uri: string | WebSocket | WsWebSocket, opts: WsTransport.Options = {}): Promise<WsTransport> {
    const {
      connectTimeout = 10000,
      signal,
    } = opts;

    return new Promise<WsTransport>((resolve, reject) => {
      const sock = typeof uri === "string" ? makeWebSocket(uri) : uri as unknown as WebSocket;
      if (sock.readyState === sock.OPEN) {
        resolve(new WsTransport(sock, opts));
        return;
      }

      const fail = (err?: Error) => {
        sock.close();
        reject(err);
      };
      const timeout = setTimeout(() => fail(new Error("connectTimeout")), connectTimeout);

      const onabort = () => fail(new Error("abort"));
      (signal as AbortSignal | undefined)?.addEventListener("abort", onabort);

      const onerror = (evt: Event) => {
        sock.close();
        reject(new Error((evt as ErrorEvent).message));
      };
      sock.addEventListener("error", onerror);

      sock.addEventListener("open", () => {
        clearTimeout(timeout);
        sock.removeEventListener("error", onerror);
        (signal as AbortSignal | undefined)?.removeEventListener("abort", onabort);
        resolve(new WsTransport(sock, opts));
      });
    });
  }

  /** Create a transport and add to forwarder. */
  export const createFace = L3Face.makeCreateFace(connect);
}
