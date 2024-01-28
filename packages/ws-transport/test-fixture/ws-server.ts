import { once } from "node:events";
import http from "node:http";
import type * as net from "node:net";

import { NetServerBase } from "@ndn/node-transport/test-fixture/net-server";
import { WebSocket, WebSocketServer } from "ws";

/** WebSocket test server. */
export class WsServer extends NetServerBase<WebSocketServer, WebSocket> {
  public override get clients() { return this.server.clients; }

  /** WebSocket server URI. */
  public uri!: string;

  private readonly http: http.Server;

  constructor() {
    super(new WebSocketServer({ server: http.createServer(), clientTracking: true }));
    this.http = this.server.options.server as http.Server;
  }

  public override async open(): Promise<void> {
    this.http.listen(0, "127.0.0.1");
    await once(this.http, "listening");
    const { port } = this.http.address() as net.AddressInfo;
    this.uri = `ws://127.0.0.1:${port}/`;
  }

  public override async close(): Promise<void> {
    for (const client of this.server.clients) {
      client.close();
    }
    this.server.close();
    this.http.close();
    await once(this.http, "close");
  }
}

/** Connect several WebSockets and relay messages among them. */
export function bridgeWebSockets(sockets: readonly WebSocket[]): void {
  const send = (evt: { data: any; target: WebSocket }) => {
    for (const dst of sockets) {
      if (dst !== evt.target && dst.readyState === WebSocket.OPEN) {
        dst.send(evt.data);
      }
    }
  };

  for (const sock of sockets) {
    sock.addEventListener("message", send);
  }
}
