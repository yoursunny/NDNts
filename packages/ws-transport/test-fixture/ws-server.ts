import { once } from "node:events";
import http from "node:http";
import type * as net from "node:net";

import { NetServerBase } from "@ndn/node-transport/test-fixture/net-server";
import { type MessageEvent, WebSocket, WebSocketServer } from "ws";

/** WebSocket test server. */
export class WsServer extends NetServerBase<WebSocketServer, WebSocket> {
  public override get clients() { return this.server.clients; }

  /** WebSocket server URI. */
  public get uri() {
    return this.uri_;
  }

  private uri_!: string;
  private readonly http: http.Server;

  constructor() {
    const server = http.createServer();
    super(new WebSocketServer({ server, clientTracking: true }));
    this.http = server;

    this.server.on("connection", (sock) => {
      sock.on("error", () => undefined);
    });
  }

  public override async open(): Promise<this> {
    this.http.listen(0, "127.0.0.1");
    await once(this.http, "listening");
    const { port } = this.http.address() as net.AddressInfo;
    this.uri_ = `ws://127.0.0.1:${port}/`;
    return this;
  }

  public override async [Symbol.asyncDispose](): Promise<void> {
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
  const send = ({ target: src, data }: MessageEvent) => {
    for (const dst of sockets) {
      if (dst !== src && dst.readyState === WebSocket.OPEN) {
        dst.send(data);
      }
    }
  };

  for (const sock of sockets) {
    sock.addEventListener("message", send);
  }
}
