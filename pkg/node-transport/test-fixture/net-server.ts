import { type EventEmitter, once } from "node:events";
import net from "node:net";

import { assert } from "@ndn/util";
import { makeTmpDir, type TmpDir } from "@ndn/util/test-fixture/tmp";
import { long2ip } from "netmask";

import { joinHostPort } from "..";

/**
 * Transport test server.
 * @typeParam Server - Server instance type.
 * @typeParam Client - Client socket type as seen by the server.
 */
export abstract class TestServer<Server, Client> implements AsyncDisposable {
  /**
   * Constructor.
   * @param server - Server instance.
   */
  protected constructor(public readonly server: Server) {}

  /** Collection of active clients. */
  public get clients(): ReadonlySet<Client> {
    return this.mClients;
  }

  protected readonly mClients = new Set<Client>();

  public abstract [Symbol.asyncDispose](): Promise<void>;

  /**
   * Wait until at least n clients are connected.
   * @param n - Minimum required clients quantity.
   * @param timeout - Timeout in milliseconds.
   * @returns Exactly n clients.
   */
  public readonly waitNClients = async (n: number, timeout = 1000): Promise<Client[]> => {
    if (this.clients.size < n) {
      await this.waitNClientsImpl(n, timeout);
      assert(this.clients.size >= n);
    }
    return Array.from(this.clients).slice(0, n);
  };

  protected abstract waitNClientsImpl(n: number, timeout: number): Promise<void>;
}
export namespace TestServer {
  /**
   * `TestServer.waitNClientsImpl` implementation for Server that emits "connection" event.
   */
  export function waitNClientsConnectionEvent({ server, clients }: TestServer<EventEmitter, unknown>, n: number, timeout: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const onConnect = () => {
        if (clients.size >= n) {
          clearTimeout(timer);
          server.off("connection", onConnect);
          resolve();
        }
      };
      const timer = setTimeout(() => {
        server.off("connection", onConnect);
        reject(new Error("waitNClientsConnectionEvent timeout"));
      }, timeout);
      server.on("connection", onConnect);
    });
  }
}

/** Socket test server. */
export abstract class NetServer extends TestServer<net.Server, net.Socket> {
  /** If set to true, server periodically sends NDNLPv2 IDLE frames to new clients. */
  public sendToClients = false;

  protected constructor(server: net.Server) {
    super(server);
    this.server.on("error", () => undefined);
    this.server.on("connection", this.handleNewClient);
  }

  public override async [Symbol.asyncDispose](): Promise<void> {
    this.server.off("connection", this.handleNewClient);
    this.server.close();
    await once(this.server, "close");

    for (const client of this.clients) {
      client.end();
    }
    this.mClients.clear();
  }

  private readonly handleNewClient = (sock: net.Socket) => {
    this.mClients.add(sock);

    let interval: NodeJS.Timeout | number | undefined;
    if (this.sendToClients) {
      interval = setInterval(() => {
        try {
          sock.write(Uint8Array.of(0x64, 0x00)); // NDNLPv2 IDLE packet
        } catch {
          sock.destroy();
        }
      }, 10);
    }

    const close = () => {
      if (interval) { clearInterval(interval); }
      sock.off("error", close);
      sock.off("end", close);
      sock.off("close", close);
      sock.destroy();
      this.mClients.delete(sock);
    };
    sock.on("error", close);
    sock.once("end", close);
    sock.once("close", close);
  };

  protected override waitNClientsImpl(n: number, timeout: number) {
    return TestServer.waitNClientsConnectionEvent(this, n, timeout);
  }
}

/** TCP socket test server. */
export class TcpServer extends NetServer {
  public static async create(): Promise<TcpServer> {
    const ip = long2ip(0x7F790000 | Math.trunc(0xFFFF * Math.random())); // 127.121.x.x
    const server = net.createServer();
    server.listen({ host: ip, port: 0 });
    await once(server, "listening");
    return new TcpServer(server);
  }

  private constructor(server: net.Server) {
    super(server);
    const { address, port } = this.server.address() as net.AddressInfo;
    this.host = address;
    this.port = port;
  }

  /** Server IP address. */
  public readonly host: string;

  /** Server port. */
  public readonly port: number;

  /** Server ip:port. */
  public get hostport(): string {
    return joinHostPort(this.host, this.port);
  }

  /** Server URI usable as NDNTS_UPLINK and NDN_CLIENT_TRANSPORT. */
  public get uri(): string {
    return `tcp://${this.hostport}`;
  }
}

/** Unix socket test server. */
export class IpcServer extends NetServer {
  public static async create(): Promise<IpcServer> {
    let tmpDir: TmpDir | undefined;
    const path = process.platform === "win32" ?
      `//./pipe/2a8370be-8abc-448f-bb09-54d8b243cf7a/${Math.trunc(Math.random() * 0x100000000)}` :
      (tmpDir = makeTmpDir()).filename();

    const server = net.createServer();
    server.listen(path);
    await once(server, "listening");
    return new IpcServer(server, path, tmpDir);
  }

  /**
   * @param path - Unix/IPC server path.
   */
  private constructor(server: net.Server, public readonly path: string, private readonly tmpDir?: TmpDir) {
    super(server);
  }

  public override [Symbol.asyncDispose](): Promise<void> {
    this.tmpDir?.[Symbol.dispose]();
    return super[Symbol.asyncDispose]();
  }
}
