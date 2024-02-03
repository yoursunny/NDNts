import { asUint8Array } from "@ndn/util";
import { WebSocket as WsWebSocket } from "ws";

export function makeWebSocket(uri: string): WebSocket {
  if (globalThis.WebSocket) {
    return new WebSocket(uri, []);
  }
  return new WsWebSocket(uri, [], { perMessageDeflate: false }) as unknown as WebSocket;
}

export function changeBinaryType(sock: WebSocket): void {
  sock.binaryType = "arraybuffer";
  if (sock instanceof WsWebSocket) {
    (sock as unknown as WsWebSocket).binaryType = "nodebuffer";
  }
}

export function extractMessage(evt: MessageEvent<Buffer | ArrayBuffer>): Uint8Array {
  return asUint8Array(evt.data);
}
