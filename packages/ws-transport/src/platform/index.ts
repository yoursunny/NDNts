import WsWebSocket from "ws";

export import WebSocket = WsWebSocket;

export function makeWebSocket(uri: string): WebSocket {
  return new WsWebSocket(uri, [], { perMessageDeflate: false });
}
