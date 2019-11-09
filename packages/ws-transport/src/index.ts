import { rxFromPacketIterable, Transport } from "@ndn/l3face";
import { EventIterator } from "event-iterator";

import { makeWebSocket, WebSocket } from "./platform";

const HANDLER = Symbol("WsTransport.HANDLER");

/** WebSocket transport. */
export class WsTransport implements Transport {
  public static connect(uri: string, opts: WsTransport.Options = {}): Promise<WsTransport> {
    return new Promise<WsTransport>((resolve, reject) => {
      const sock = makeWebSocket(uri);
      sock.binaryType = "arraybuffer";
      const onerror = (evt: WebSocket.ErrorEvent) => { reject(new Error(evt.message)); };
      sock.addEventListener("error", onerror);
      sock.addEventListener("open", () => {
        sock.removeEventListener("error", onerror);
        resolve(new WsTransport(sock, uri, opts));
      });
    });
  }

  public readonly rx: Transport.Rx;
  private readonly bufferLimit: number;
  private readonly describe: string;

  constructor(private readonly sock: WebSocket, uri: string, {
    bufferLimit: bufferLimit = 1024 * 1024,
  }: WsTransport.Options) {
    this.rx = rxFromPacketIterable(new EventIterator<Uint8Array>(
      (push, stop, fail) => {
        sock.addEventListener("message", (push as any)[HANDLER] = (event: WebSocket.MessageEvent) => {
          push(new Uint8Array(event.data as ArrayBuffer));
        });
        sock.addEventListener("close", stop);
        sock.addEventListener("error", (fail as any)[HANDLER] = (event: WebSocket.ErrorEvent) => {
          fail(new Error(event.message));
        });
      },
      (push, stop, fail) => {
        sock.removeEventListener("message", (push as any)[HANDLER]);
        sock.removeEventListener("close", stop);
        sock.removeEventListener("error", (fail as any)[HANDLER]);
      },
    ));
    this.describe = `WebSocket(${uri})`;
    this.bufferLimit = bufferLimit;
  }

  public tx = async (iterable: AsyncIterable<Uint8Array>): Promise<void> => {
    for await (const pkt of iterable) {
      this.sock.send(pkt);
      if (this.sock.bufferedAmount > this.bufferLimit) {
        await this.waitForTxBuffer();
      }
    }
    this.sock.close();
  }

  private waitForTxBuffer(): Promise<void> {
    return new Promise((resolve) => {
      const timer = setInterval(() => {
        if (this.sock.bufferedAmount <= this.bufferLimit || this.sock.readyState !== WebSocket.OPEN) {
          clearInterval(timer);
          resolve();
        }
      }, 100);
    });
  }

  public toString() {
    return this.describe;
  }
}

export namespace WsTransport {
  export interface Options {
    /** TX buffer limit in bytes. */
    bufferLimit?: number;
  }
}
