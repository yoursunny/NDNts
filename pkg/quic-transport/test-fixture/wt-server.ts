import { TestServer } from "@ndn/node-transport/test-fixture/net-server";
import { assert, sha256 } from "@ndn/util";
import { type ClientSession, createServer, type ServerSession, type ServerTlsSniEntry, type WebTransportServer } from "@webtransport-bun/webtransport";
import selfsigned from "selfsigned";

export async function makeSelfSigned(): Promise<ServerTlsSniEntry & { certHash: Uint8Array<ArrayBuffer> }> {
  const serverName = "127.0.0.1";
  const notBeforeDate = new Date();
  const notAfterDate = new Date(notBeforeDate.getTime() + 86400_000);
  const generated = await selfsigned.generate([
    { name: "commonName", value: serverName },
  ], {
    notBeforeDate,
    notAfterDate,
    keyType: "ec",
    curve: "P-256",
    algorithm: "sha256",
    extensions: [
      { name: "subjectAltName", altNames: [{ type: 7, ip: serverName }] },
    ],
  });

  const certDer = Buffer.from(generated.cert.replaceAll(/(-----(BEGIN|END) CERTIFICATE-----)|\s/g, ""), "base64");
  return {
    serverName,
    certPem: generated.cert,
    keyPem: generated.private,
    certHash: await sha256(certDer),
  };
}

/** WebTransport test server. */
export class WtServer extends TestServer<WebTransportServer, ServerSession> {
  public static async create(): Promise<WtServer> {
    let self!: WtServer; // eslint-disable-line prefer-const

    const { certHash, ...tls } = await makeSelfSigned();
    const port = 16384 + Math.trunc(Math.random() * 16384);
    const server = createServer({
      port,
      tls,
      onSession: (sess) => self.onSession(sess),
    });

    self = new WtServer(server, `https://127.0.0.1:${port}`, certHash);
    return self;
  }

  /**
   * @param port - WebTransport server URI.
   * @param certHash - WebTransport server certificate hash.
   */
  constructor(server: WebTransportServer, public readonly uri: string, public readonly certHash: Uint8Array<ArrayBuffer>) {
    super(server);
  }

  public get serverCertificateHashes(): WebTransportHash[] {
    return [{ algorithm: "sha-256", value: this.certHash }];
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
