import { once } from "node:events";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";

import Koa from "koa";
import type { Promisable } from "type-fest";

/** Mock NDN-FCH server. */
export class FchServer {
  public static async create(): Promise<FchServer> {
    const s = new FchServer();
    await once(s.server, "listening", { signal: AbortSignal.timeout(1000) });
    return s;
  }

  private readonly app = new Koa();
  private readonly server: Server;

  private constructor() {
    this.app.use(async (ctx: Koa.Context) => {
      ctx.assert(ctx.URL.pathname === "/", 404);
      ctx.assert(ctx.method === "GET", 405);
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

  /** Handler of "GET /" request. */
  public handle?(params: URLSearchParams, ctx: Koa.Context): Promisable<unknown>;
}
