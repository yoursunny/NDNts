import { createServer as createHttpServer, Server as HttpServer } from "http";
import { AddressInfo } from "net";
import WebSocket, { Server as WsServer } from "ws";

let httpServer: HttpServer;
export let wss: WsServer;
export let uri: string;

export function createServer(): Promise<string> {
  httpServer = createHttpServer();
  wss = new WsServer({ server: httpServer, clientTracking: true });
  return new Promise<string>((resolve) => {
    httpServer.listen(0, "127.0.0.1", () => {
      const { port } = httpServer.address() as AddressInfo;
      uri = `ws://127.0.0.1:${port}`;
      resolve(uri);
    });
  });
}

export function destroyServer() {
  if (uri === "") {
    return;
  }
  uri = "";
  wss.close();
  httpServer.close();
}

export async function waitNClients(n: number): Promise<WebSocket[]> {
  while (wss.clients.size < n) {
    // eslint-disable-next-line @typescript-eslint/no-loop-func
    await new Promise((r) => wss.once("connection", r));
  }
  return Array.from(wss.clients);
}

export function enableBroadcast() {
  for (const client of wss.clients) {
    const sender = client;
    // eslint-disable-next-line @typescript-eslint/no-loop-func
    sender.on("message", (msg) => {
      for (const recipient of wss.clients) {
        if (recipient !== sender && recipient.readyState === recipient.OPEN) {
          recipient.send(msg);
        }
      }
    });
  }
}
