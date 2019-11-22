import { Decoder } from "@ndn/tlv";
import { fromStream, writeToStream } from "streaming-iterables";

import { Transport } from "./mod";

export async function* rxFromPacketIterable(iterable: AsyncIterable<Uint8Array>): Transport.Rx {
  for await (const pkt of iterable) {
    const decoder = new Decoder(pkt);
    let tlv: Decoder.Tlv;
    try { tlv = decoder.read(); }
    catch (err) { continue; }
    yield tlv;
  }
}

async function* fromStreamSafe(conn: NodeJS.ReadableStream) {
  try { yield* fromStream<Buffer>(conn); }
  catch (err) {}
}

export async function* rxFromStream(conn: NodeJS.ReadableStream): Transport.Rx {
  let leftover = Buffer.alloc(0);
  for await (const chunk of fromStreamSafe(conn)) {
    if (leftover.length > 0) {
      leftover = Buffer.concat([leftover, chunk], leftover.length + chunk.length);
    } else {
      leftover = chunk;
    }
    const decoder = new Decoder(leftover);
    let consumed = 0;
    while (true) {
      let tlv: Decoder.Tlv;
      try { tlv = decoder.read(); }
      catch (err) { break; }
      yield tlv;
      consumed += tlv.size;
    }
    if (consumed > 0) {
      leftover = leftover.subarray(consumed);
    }
  }
}

export function txToStream(conn: NodeJS.WritableStream): Transport.Tx {
  return async (iterable: AsyncIterable<Uint8Array>) => {
    try {
      await writeToStream(conn, iterable);
    } finally {
      const destroyable = conn as unknown as { destroy?: () => void };
      /* istanbul ignore else */
      if (typeof destroyable.destroy === "function") {
        destroyable.destroy();
      } else {
        conn.end();
      }
    }
  };
}
