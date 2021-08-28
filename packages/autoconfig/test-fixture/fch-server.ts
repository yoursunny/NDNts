import Koa from "koa";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";

export class FchServer {
  public static async create(): Promise<FchServer> {
    const s = new FchServer();
    await new Promise((resolve, reject) => {
      s.server.once("listening", resolve);
      s.server.once("error", reject);
    });
    return s;
  }

  private readonly app = new Koa();
  private readonly server: Server;

  private constructor() {
    this.app.use(async (ctx) => {
      if (ctx.URL.pathname !== "/") {
        ctx.status = 404;
        return;
      }
      ctx.body = await this.handle?.(ctx.URL.searchParams, ctx);
    });
    this.server = this.app.listen();
  }

  public get uri(): string {
    const addr = this.server.address() as AddressInfo;
    return `http://localhost:${addr.port}`;
  }

  public close(): void {
    this.server.close();
  }

  public handle?: (params: URLSearchParams, ctx: Koa.Context) => Promise<unknown>;
}
