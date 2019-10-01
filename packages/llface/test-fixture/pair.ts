import duplexify from "duplexify";
import { PassThrough } from "readable-stream";

import { DatagramTransport, LLFace, Transport } from "../src";

export function createTransportPair(): [Transport, Transport] {
  const connAB = new PassThrough({ objectMode: true });
  const connBA = new PassThrough({ objectMode: true });
  const endA = duplexify(connAB, connBA);
  const endB = duplexify(connBA, connAB);
  return [new DatagramTransport(endA), new DatagramTransport(endB)];
}

export function createFacePair(): [LLFace, LLFace] {
  const [transportA, transportB] = createTransportPair();
  return [new LLFace(transportA), new LLFace(transportB)];
}
