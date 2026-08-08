import { TestServer } from "@ndn/node-transport/test-fixture/net-server";
import { assert } from "@ndn/util";
import { type ClientSession, createServer, type ServerSession, type WebTransportServer } from "@webtransport-bun/webtransport";

/** WebTransport test server. */
export class WtServer extends TestServer<WebTransportServer, ServerSession> {
  public static async create(): Promise<WtServer> {
    let self!: WtServer; // eslint-disable-line prefer-const

    const port = 16384 + Math.trunc(Math.random() * 16384);
    const server = createServer({
      port,
      tls: { certPem: "", keyPem: "", allowSelfSigned: true },
      onSession: (sess) => self.onSession(sess),
    });

    self = new WtServer(server, port);
    return self;
  }

  /** WebTransport server URI. */
  public readonly uri: string;

  constructor(server: WebTransportServer, port: number) {
    super(server);
    this.uri = `https://127.0.0.1:${port}`;
  }

  private waitNewSession?: () => void;

  private readonly onSession = async (sess: ServerSession) => {
    this.mClients.add(sess);
    this.waitNewSession?.();
    try {
      await sess.closed;
    } catch (err: unknown) {
      console.warn("WtServer await sess.closed error", err);
    } finally {
      this.mClients.delete(sess);
    }
  };

  public async [Symbol.asyncDispose](): Promise<void> {
    await this.server.close();
    const closedPromises = Array.from(this.clients, (c) => c.closed);
    for (const client of this.clients) {
      client.close();
    }
    this.mClients.clear();
    await Promise.allSettled(closedPromises);
  }

  protected override async waitNClientsImpl(n: number, timeout: number): Promise<void> {
    assert(!this.waitNewSession); // waitNClientsImpl is designed to be non-reentrant
    try {
      while (this.clients.size < n) {
        await new Promise<void>((resolve) => {
          this.waitNewSession = resolve;
        });
      }
    } finally {
      this.waitNewSession = undefined;
    }
  }
}

type CommonSession = ServerSession | ClientSession;

/** Connect several WebTransport sessions and relay messages among them. */
export function bridgeSessions(sessions: readonly CommonSession[]): void {
  const relayDatagrams = async (src: CommonSession) => {
    for await (const datagram of src.incomingDatagrams()) {
      for (const dst of sessions) {
        if (dst !== src) {
          await dst.sendDatagram(datagram);
        }
      }
    }
  };

  for (const sess of sessions) {
    void relayDatagrams(sess);
  }
}
