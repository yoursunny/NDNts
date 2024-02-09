import { type EventEmitter, once } from "node:events";
import net from "node:net";

import { makeTmpDir, type TmpDir } from "@ndn/util/test-fixture/tmp";

/**
 * Transport test server.
 * @typeParam Server - Server instance type.
 * @typeParam Client - Client socket type as seen by the server.
 */
export interface TestServer<Server, Client> extends AsyncDisposable {
  /** Server instance. */
  readonly server: Server;

  /** Collection of active clients. */
  readonly clients: ReadonlySet<Client>;

  /** Start listening. */
  open(): Promise<this>;

  /**
   * Wait until at least n clients are connected.
   * @param n - Minimum required clients quantity.
   * @returns Exactly n clients.
   */
  waitNClients(n: number): Promise<Client[]>;
}

export abstract class NetServerBase<Server extends EventEmitter, Client> implements TestServer<Server, Client> {
  public get clients() { return this.clients_; }
  private readonly clients_ = new Set<Client>();

  constructor(public readonly server: Server) {}

  public abstract open(): Promise<this>;

  public abstract [Symbol.asyncDispose](): Promise<void>;

  public readonly waitNClients = async (n: number): Promise<Client[]> => {
    while (this.clients.size < n) {
      await once(this.server, "connection");
    }
    return Array.from(this.clients).slice(0, n);
  };
}

/** Socket test server. */
export abstract class NetServer extends NetServerBase<net.Server, net.Socket> {
  /** If set to true, server periodically sends NDNLPv2 IDLE frames to new clients. */
  public sendToClients = false;

  constructor() {
    super(net.createServer());
    this.server.on("error", () => undefined);
    this.server.on("connection", this.handleNewClient);
  }

  public override async open(): Promise<this> {
    this.listenBegin();
    await once(this.server, "listening");
    this.listenEnd();
    return this;
  }

  /** Action before waiting for "listening" event. */
  protected abstract listenBegin(): void;

  /** Action after "listening" event has been emitted. */
  protected listenEnd(): void {
    //
  }

  public override async [Symbol.asyncDispose](): Promise<void> {
    this.server.off("connection", this.handleNewClient);
    this.server.close();
    await once(this.server, "close");

    for (const client of this.clients) {
      client.end();
    }
    this.clients.clear();
  }

  private readonly handleNewClient = (sock: net.Socket) => {
    this.clients.add(sock);

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
      sock.destroy();
      this.clients.delete(sock);
    };
    sock.on("error", close);
    sock.once("end", close);
    sock.once("close", close);
  };
}

/** TCP socket test server. */
export class TcpServer extends NetServer {
  /** TCP server port. */
  public get port() { return this.port_; }
  private port_ = 0;

  protected override listenBegin(): void {
    this.server.listen();
  }

  protected override listenEnd(): void {
    const { port } = this.server.address() as net.AddressInfo;
    this.port_ = port;
  }
}

/** Unix socket test server. */
export class IpcServer extends NetServer {
  /** Unix/IPC server path. */
  public readonly path = process.platform === "win32" ?
    `//./pipe/2a8370be-8abc-448f-bb09-54d8b243cf7a/${Math.trunc(Math.random() * 0x100000000)}` :
    (this.tmpDir = makeTmpDir()).filename();

  private tmpDir?: TmpDir;

  public override [Symbol.asyncDispose](): Promise<void> {
    this.tmpDir?.[Symbol.dispose]();
    return super[Symbol.asyncDispose]();
  }

  protected override listenBegin(): void {
    this.server.listen(this.path);
  }
}
