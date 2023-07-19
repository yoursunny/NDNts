export function makeWebSocket(uri: string): WebSocket {
  return new WebSocket(uri, []);
}

export const binaryType = "arraybuffer";

export function extractMessage(evt: MessageEvent): Uint8Array {
  return new Uint8Array(evt.data);
}
