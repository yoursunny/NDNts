import { Decoder } from "@ndn/tlv";
import { safeIter } from "@ndn/util";
import { pEvent } from "p-event";
import { fromStream, writeToStream } from "streaming-iterables";

import type { Transport } from "./transport";

export async function* rxFromStream(conn: NodeJS.ReadableStream): Transport.Rx {
  let leftover = Buffer.alloc(0);
  for await (const chunk of safeIter(fromStream<Buffer>(conn))) {
    if (leftover.length > 0) {
      leftover = Buffer.concat([leftover, chunk], leftover.length + chunk.length);
    } else {
      leftover = chunk;
    }
    const decoder = new Decoder(leftover);
    let consumed = 0;
    while (true) {
      let tlv: Decoder.Tlv;
      try { tlv = decoder.read(); } catch { break; }
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
      conn.end();
      try { await pEvent(conn, "finish", { timeout: 100 }); } catch {}

      const destroyable = conn as unknown as { destroy?: () => void };
      /* istanbul ignore else */
      if (typeof destroyable.destroy === "function") {
        destroyable.destroy();
      }
    }
  };
}
