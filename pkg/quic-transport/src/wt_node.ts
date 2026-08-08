import { WebTransport as bunWebTransport } from "@webtransport-bun/webtransport";

import type { H3Transport } from "./h3-transport";

export const supported = true;

export function makeWebTransport(uri: string, opts: WebTransportOptions): WebTransport {
  const { insecureSkipVerify = false } = opts as H3Transport.Options;
  void opts;
  return new bunWebTransport(uri, {
    strictW3CErrors: true,
    tls: { insecureSkipVerify },
  }) as unknown as WebTransport;
}
