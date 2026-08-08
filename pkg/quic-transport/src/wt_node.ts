import { WebTransport as bunWebTransport, type WebTransportClientOptions } from "@webtransport-bun/webtransport";

import type { H3Transport } from "./h3-transport";

export const supported = true;

export function makeWebTransport(uri: string, opts: WebTransportOptions): WebTransport {
  const { insecureSkipVerify = false, serverCertificateHashes } = opts as H3Transport.Options;
  return new bunWebTransport(uri, {
    strictW3CErrors: true,
    serverCertificateHashes: serverCertificateHashes as WebTransportClientOptions["serverCertificateHashes"],
    tls: { insecureSkipVerify },
  }) as unknown as WebTransport;
}
