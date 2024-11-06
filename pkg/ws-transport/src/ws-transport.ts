import { L3Face, rxFromPacketIterable, Transport } from "@ndn/l3face";
import EventIterator from "event-iterator";
import { pEvent } from "p-event";
import type { WebSocket as WsWebSocket } from "ws";

import { changeBinaryType, extractMessage, makeWebSocket } from "./ws_node";

/** WebSocket transport. */
export class WsTransport extends Transport {
  /**
   * Create a transport by connecting to WebSocket server or from existing WebSocket instance.
   * @param uri - Server URI or existing WebSocket instance.
   * @see {@link WsTransport.createFace}
   */
  public static async connect(
      uri: string | WebSocket | WsWebSocket,
      opts: WsTransport.Options = {},
  ): Promise<WsTransport> {
    const sock = typeof uri === "string" ? makeWebSocket(uri) : uri as unknown as WebSocket;
    if (sock.readyState !== sock.OPEN) {
      try {
        await pEvent(sock, "open", { timeout: opts.connectTimeout ?? 10000 });
      } catch (err: unknown) {
        // ignore potential "WebSocket was closed before the connection was established" error
        sock.addEventListener("error", () => undefined);
        sock.close();
        throw err;
      }
    }
    return new WsTransport(sock, opts);
  }

  private constructor(private readonly sock: WebSocket, private readonly opts: WsTransport.Options) {
    super({ describe: `WebSocket(${sock.url})` });
    changeBinaryType(sock);
    this.rx = rxFromPacketIterable(new EventIterator<Uint8Array>(({ push, stop }) => {
      const handleMessage = (evt: MessageEvent) => {
        push(extractMessage(evt));
      };
      sock.addEventListener("message", handleMessage);
      sock.addEventListener("close", stop);
      return () => {
        sock.removeEventListener("message", handleMessage);
        sock.removeEventListener("close", stop);
      };
    }));

    this.highWaterMark = opts.highWaterMark ?? 1024 * 1024;
    this.lowWaterMark = opts.lowWaterMark ?? 16 * 1024;
  }

  /**
   * Report MTU as Infinity.
   * @see {@link https://stackoverflow.com/a/20658569}
   */
  public override get mtu() { return Infinity; }

  public override readonly rx: Transport.RxIterable;

  private readonly highWaterMark: number;
  private readonly lowWaterMark: number;

  public override async tx(iterable: Transport.TxIterable) {
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
  }

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

  public close(): void {
    this.sock.close();
  }

  /** Reopen the transport by connecting again with the same options. */
  public override reopen() {
    return WsTransport.connect(this.sock.url, this.opts);
  }
}

export namespace WsTransport {
  /** {@link WsTransport.connect} options. */
  export interface Options {
    /**
     * Connect timeout (in milliseconds).
     * @defaultValue 10000
     */
    connectTimeout?: number;

    /**
     * Buffer amount (in bytes) to start TX throttling.
     * @defaultValue 1 MiB
     */
    highWaterMark?: number;

    /**
     * Buffer amount (in bytes) to stop TX throttling.
     * @defaultValue 16 KiB
     */
    lowWaterMark?: number;
  }

  /** Create a transport and add to forwarder. */
  export const createFace = L3Face.makeCreateFace(WsTransport.connect);
}
