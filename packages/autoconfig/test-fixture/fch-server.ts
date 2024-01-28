import { once } from "node:events";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";

import Koa from "koa";
import type { Promisable } from "type-fest";

type Handler = (params: URLSearchParams, ctx: Koa.Context) => Promisable<unknown>;

/** Mock NDN-FCH server. */
export class FchServer implements AsyncDisposable {
  /**
   * Create NDN-FCH server.
   * @param handle "GET /" request handler.
   */
  public static async create(handle: Handler): Promise<FchServer> {
    const s = new FchServer(handle);
    await once(s.server, "listening", { signal: AbortSignal.timeout(1000) });
    return s;
  }

  private readonly app = new Koa();
  private readonly server: Server;

  private constructor(handle: Handler) {
    this.app.use(async (ctx: Koa.Context) => {
      ctx.assert(ctx.URL.pathname === "/", 404);
      ctx.assert(ctx.method === "GET", 405);
      ctx.body = await handle(ctx.URL.searchParams, ctx);
    });
    this.server = this.app.listen();
  }

  public get uri(): string {
    const addr = this.server.address() as AddressInfo;
    return `http://localhost:${addr.port}`;
  }

  public async [Symbol.asyncDispose](): Promise<void> {
    this.server.close();
    await once(this.server, "close");
  }
}
