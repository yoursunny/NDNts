import { WebSocket as WsWebSocket } from "ws";

export function makeWebSocket(uri: string): WebSocket {
  return new WsWebSocket(uri, [], { perMessageDeflate: false }) as unknown as WebSocket;
}

export const binaryType = "nodebuffer";

export function extractMessage(evt: MessageEvent): Uint8Array {
  return evt.data as Buffer;
}
