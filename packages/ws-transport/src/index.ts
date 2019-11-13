import { rxFromPacketIterable, Transport } from "@ndn/l3face";
import { EventIterator } from "event-iterator";

import { makeWebSocket } from "./platform";

const HANDLER = Symbol("WsTransport.HANDLER");

/** WebSocket transport. */
export class WsTransport extends Transport {
  public readonly rx: Transport.Rx;
  private readonly highWaterMark: number;
  private readonly lowWaterMark: number;

  constructor(private readonly sock: WebSocket, opts: WsTransport.Options) {
    super({
      describe: `WebSocket(${sock.url})`,
    });
    sock.binaryType = "arraybuffer";
    this.rx = rxFromPacketIterable(new EventIterator<Uint8Array>(
      (push, stop, fail) => {
        sock.addEventListener("message", (push as any)[HANDLER] = (evt: MessageEvent) => {
          push(new Uint8Array(evt.data as ArrayBuffer));
        });
        sock.addEventListener("close", stop);
        sock.addEventListener("error", (fail as any)[HANDLER] = (evt: Event) => {
          fail(new Error((evt as ErrorEvent).message));
        });
      },
      (push, stop, fail) => {
        sock.removeEventListener("message", (push as any)[HANDLER]);
        sock.removeEventListener("close", stop);
        sock.removeEventListener("error", (fail as any)[HANDLER]);
      },
    ));
    this.highWaterMark = opts.highWaterMark ?? 1024 * 1024;
    this.lowWaterMark = opts.lowWaterMark ?? 16 * 1024;
  }

  public close() {
    this.sock.close();
  }

  public tx = async (iterable: AsyncIterable<Uint8Array>): Promise<void> => {
    for await (const pkt of iterable) {
      this.sock.send(pkt);
      if (this.sock.bufferedAmount > this.highWaterMark) {
        await this.waitForTxBuffer();
      }
    }
    this.close();
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
}

export namespace WsTransport {
  export interface Options {
    /** Buffer amount (in bytes) to start TX throttling. */
    highWaterMark?: number;
    /** Buffer amount (in bytes) to stop TX throttling. */
    lowWaterMark?: number;
  }

  export function connect(uri: string, opts: WsTransport.Options = {}): Promise<WsTransport> {
    return new Promise<WsTransport>((resolve, reject) => {
      const sock = makeWebSocket(uri);
      const onerror = (evt: Event) => reject(new Error((evt as ErrorEvent).message));
      sock.addEventListener("error", onerror);
      sock.addEventListener("open", () => {
        sock.removeEventListener("error", onerror);
        resolve(new WsTransport(sock, opts));
      });
    });
  }
}
