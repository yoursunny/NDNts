import { WebTransport as bunWebTransport } from "@webtransport-bun/webtransport";

export const supported = true;

export function makeWebTransport(uri: string, opts: WebTransportOptions): WebTransport {
  void opts;
  return new bunWebTransport(uri, {
    strictW3CErrors: true,
  }) as unknown as WebTransport;
}
