export function makeWebSocket(uri: string): WebSocket {
  return new WebSocket(uri, []);
}
