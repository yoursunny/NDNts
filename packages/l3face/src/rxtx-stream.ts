import type { Socket } from "node:net";

import { Decoder } from "@ndn/tlv";
import { concatBuffers, safeIter } from "@ndn/util";
import { pEvent } from "p-event";
import { writeToStream } from "streaming-iterables";

import type { Transport } from "./transport";

/**
 * Parse TLVs from input stream.
 * @param conn input stream, such as a socket.
 * @returns AsyncIterable of TLVs.
 */
export async function* rxFromStream(conn: NodeJS.ReadableStream): Transport.Rx {
  let leftover = new Uint8Array();
  for await (const chunk of safeIter(conn as AsyncIterable<Buffer>)) {
    if (leftover.length > 0) {
      leftover = concatBuffers([leftover, chunk], leftover.length + chunk.length);
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

/**
 * Pipe encoded packets to output stream.
 * @param conn output stream, such as a socket.
 * @returns a function that accepts AsyncIterable of Uint8Array containing encoded packets.
 */
export function txToStream(conn: NodeJS.WritableStream): Transport.Tx {
  return async (iterable: AsyncIterable<Uint8Array>) => {
    try {
      await writeToStream(conn, iterable);
    } finally {
      try {
        conn.end();
        await pEvent(conn, "finish", { timeout: 100 });
      } catch {}

      const socket = conn as Socket;
      if (typeof socket.destroy === "function") {
        socket.destroy();
      }
    }
  };
}
