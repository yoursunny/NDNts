import { L3Face, rxFromPacketIterable, Transport } from "@ndn/l3face";
import EventIterator from "event-iterator";
import type { WebSocket as WsWebSocket } from "ws";

import { changeBinaryType, extractMessage, makeWebSocket } from "./ws_node";

/** WebSocket transport. */
export class WsTransport extends Transport {
  public override readonly rx: Transport.Rx;
  private readonly highWaterMark: number;
  private readonly lowWaterMark: number;

  /**
   * Constructor.
   *
   * @remarks
   * {@link WsTransport.connect} and {@link WsTransport.createFace} are recommended.
   */
  constructor(private readonly sock: WebSocket, private readonly opts: WsTransport.Options) {
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

  public close(): void {
    this.sock.close();
  }

  public override get mtu() { return Infinity; }

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
    /**
     * Connect timeout (in milliseconds).
     * @defaultValue 10 seconds
     */
    connectTimeout?: number;

    /** AbortSignal that allows canceling connection attempt via AbortController. */
    signal?: AbortSignal;

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

  /**
   * Create a transport by connecting to WebSocket server or from existing WebSocket instance.
   * @param uri - Server URI or existing WebSocket instance.
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

      let timeout: NodeJS.Timeout | undefined; // eslint-disable-line prefer-const
      const fail = (err?: Error) => {
        clearTimeout(timeout);
        sock.close();
        reject(err);
      };
      timeout = setTimeout(() => fail(new Error("connectTimeout")), connectTimeout);

      const onabort = () => fail(new Error("abort"));
      signal?.addEventListener("abort", onabort);

      const onerror = (evt: Event) => {
        sock.close();
        reject(evt.type === "error" ? (evt as ErrorEvent).error : new Error(`${evt}`));
      };
      sock.addEventListener("error", onerror, { once: true });

      sock.addEventListener("open", () => {
        clearTimeout(timeout);
        sock.removeEventListener("error", onerror);
        signal?.removeEventListener("abort", onabort);
        resolve(new WsTransport(sock, opts));
      });
    });
  }

  /** Create a transport and add to forwarder. */
  export const createFace = L3Face.makeCreateFace(connect);
}
