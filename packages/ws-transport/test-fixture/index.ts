import * as http from "http";
import * as net from "net";
import * as rPromise from "remote-controlled-promise";
import WebSocketStream from "websocket-stream";

export class WsServerPair {
  private httpServer: http.Server;
  private wss: WebSocketStream.Server;
  private streamA?: WebSocketStream.WebSocketDuplex;
  private streamB?: WebSocketStream.WebSocketDuplex;
  private wait_ = rPromise.create();

  constructor() {
    this.httpServer = http.createServer();
    this.wss = WebSocketStream.createServer(
      { server: this.httpServer, perMessageDeflate: false },
      ((stream: WebSocketStream.WebSocketDuplex) => {
        if (this.streamB) {
          stream.end();
        } else if (this.streamA) {
          this.streamB = stream;
          this.streamA.pipe(this.streamB);
          this.streamB.pipe(this.streamA);
          this.wait_.resolve(undefined);
        } else {
          this.streamA = stream;
        }
      }) as any);
  }

  public async listen(): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      this.httpServer.listen(0, "127.0.0.1", async () => {
        const { port } = this.httpServer.address() as net.AddressInfo;
        const uri = `ws://127.0.0.1:${port}`;
        resolve(uri);
      });
    });
  }

  public waitPaired() {
    return this.wait_.promise;
  }

  public async close() {
    (this.wss as any).close();
    this.httpServer.close();
  }
}
