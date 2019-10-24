import { Transport } from "@ndn/l3face";
import { SocketTransport } from "@ndn/node-transport";
import nodeFetch from "node-fetch";

import { connect, queryFch } from ".";

export const fetch = nodeFetch;

export function overrideOptions(opts: Required<queryFch.Options>) {
  return;
}

export function createTransport(host: string, opts: Required<connect.Options>): Promise<Transport> {
  return SocketTransport.connect({ host, port: 6363 });
}
