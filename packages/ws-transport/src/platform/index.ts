import WsWebSocket from "ws";

export function makeWebSocket(uri: string): WebSocket {
  return new WsWebSocket(uri, [], { perMessageDeflate: false }) as unknown as WebSocket;
}
