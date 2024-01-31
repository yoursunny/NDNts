import { asUint8Array } from "@ndn/util";
import { WebSocket as WsWebSocket } from "ws";

export function makeWebSocket(uri: string): WebSocket {
  return new WsWebSocket(uri, [], { perMessageDeflate: false }) as unknown as WebSocket;
}

export function changeBinaryType(sock: WebSocket): void {
  for (const b of ["nodebuffer", "arraybuffer"] satisfies ReadonlyArray<WsWebSocket["binaryType"]>) {
    try {
      sock.binaryType = b as BinaryType;
    } catch {}
    if (sock.binaryType === b) {
      break;
    }
  }
}

export function extractMessage(evt: MessageEvent<Buffer | ArrayBuffer>): Uint8Array {
  return asUint8Array(evt.data);
}
