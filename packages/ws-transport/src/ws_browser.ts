export function makeWebSocket(uri: string): WebSocket {
  return new WebSocket(uri, []);
}

export function changeBinaryType(sock: WebSocket): void {
  sock.binaryType = "arraybuffer";
}

export function extractMessage(evt: MessageEvent<ArrayBuffer>): Uint8Array {
  return new Uint8Array(evt.data);
}
