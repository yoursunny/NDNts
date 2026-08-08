import { once } from "node:events";
import http from "node:http";
import type * as net from "node:net";

import { TestServer } from "@ndn/node-transport/test-fixture/net-server";
import { type MessageEvent, WebSocket, WebSocketServer } from "ws";

/** WebSocket test server. */
export class WsServer extends TestServer<WebSocketServer, WebSocket> {
  public static async create(): Promise<WsServer> {
    const httpServer = http.createServer();
    httpServer.listen(0, "127.0.0.1");
    await once(httpServer, "listening");
    return new WsServer(httpServer);
  }

  private constructor(private readonly httpServer: http.Server) {
    super(new WebSocketServer({ server: httpServer }));
    const { port } = httpServer.address() as net.AddressInfo;
    this.uri = `ws://127.0.0.1:${port}/`;
    this.server.on("connection", (sock) => {
      this.mClients.add(sock);
      sock.on("error", () => undefined);
      sock.on("close", () => this.mClients.delete(sock));
    });
  }

  /** WebSocket server URI. */
  public readonly uri: string;

  public override async [Symbol.asyncDispose](): Promise<void> {
    this.server.close();

    for (const client of this.clients) {
      client.close();
    }
    this.mClients.clear();

    this.httpServer.close();
    await once(this.httpServer, "close", { signal: AbortSignal.timeout(1000) });
  }

  protected override waitNClientsImpl(n: number, timeout: number) {
    return TestServer.waitNClientsConnectionEvent(this, n, timeout);
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
