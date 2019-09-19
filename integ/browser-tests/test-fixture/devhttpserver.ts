import * as http from "http";
import * as httpServer from "http-server";
import * as net from "net";
import * as path from "path";
import { URL } from "url";

interface HttpServer extends Pick<http.Server, "listen"> {
  readonly server: http.Server;
  close(): void;
}

export namespace DevHttpServer {
  export let server: HttpServer|undefined;

  export async function start(...rootPathSegments: string[]): Promise<void> {
    const root = path.join.apply(undefined, rootPathSegments);
    return new Promise<void>(async (resolve, reject) => {
      if (server) {
        await stop();
      }

      server = httpServer.createServer({
        cache: -1,
        root,
      }) as unknown as HttpServer;
      server.listen(0, "127.0.0.1", resolve);
    });
  }

  export async function stop(): Promise<void> {
    if (server) {
      server.close();
      server = undefined;
    }
  }

  export function getUri(relative: string): string {
    if (!server) {
      throw new Error("server is not running");
    }
    const { port } = server.server.address() as net.AddressInfo;
    const base = `http://127.0.0.1:${port}`;
    return new URL(relative, base).toString();
  }
}
