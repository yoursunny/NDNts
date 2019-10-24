import { DatagramTransport } from "@ndn/l3face";
import WebSocketStream from "websocket-stream";

/** WebSocket transport. */
export class WsTransport extends DatagramTransport {
  public static async connect(uri: string): Promise<WsTransport> {
    const stream = WebSocketStream(uri, [],
      {
        objectMode: true,
        perMessageDeflate: false,
      });
    return new WsTransport(stream, uri);
  }

  protected constructor(stream: WebSocketStream.WebSocketDuplex, uri: string) {
    super(stream, `WebSocket(${uri})`);
  }
}
