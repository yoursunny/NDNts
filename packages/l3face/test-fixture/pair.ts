import duplexify from "duplexify";
import { Duplex, PassThrough, Readable, Writable } from "readable-stream";

import { DatagramTransport, Transport } from "../src";

export function makeDuplex(rx: NodeJS.ReadableStream|undefined,
                           tx: NodeJS.WritableStream|undefined): NodeJS.ReadWriteStream {
  const dup = duplexify(tx as Writable, rx as Readable, { objectMode: true });
  if (rx) {
    rx.on("end", () => dup.destroy());
  }
  return dup;
}

export function makeTransportPair(
  cls: new(end: NodeJS.ReadWriteStream) => Transport = DatagramTransport,
  connAB: Duplex = new PassThrough({ objectMode: true }),
  connBA: Duplex = new PassThrough({ objectMode: true }),
): [Transport, Transport] {
  const endA = makeDuplex(connBA, connAB);
  const endB = makeDuplex(connAB, connBA);
  return [new cls(endA), new cls(endB)];
}
