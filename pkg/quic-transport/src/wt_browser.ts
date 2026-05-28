export const supported = !!globalThis.WebTransport;

export function makeWebTransport(uri: string, opts: WebTransportOptions): WebTransport {
  return new WebTransport(uri, opts);
}
