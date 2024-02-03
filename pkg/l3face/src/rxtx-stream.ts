import type { Socket } from "node:net";

import { Decoder } from "@ndn/tlv";
import { concatBuffers, safeIter } from "@ndn/util";
import { pEvent } from "p-event";
import { writeToStream } from "streaming-iterables";

import type { Transport } from "./transport";

/**
 * Extract TLVs from continuous byte stream.
 * @param conn - RX byte stream, such as a TCP socket.
 * @returns RX packet stream.
 */
export async function* rxFromStream(conn: NodeJS.ReadableStream): Transport.RxIterable {
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
      try {
        tlv = decoder.read();
      } catch {
        break;
      }
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
 * @param conn - TX output stream, such as a TCP socket.
 * @param iterable - TX packet stream.
 *
 * @remarks
 * `conn` will be closed/destroyed upon reaching the end of packet stream.
 */
export async function txToStream(conn: NodeJS.WritableStream, iterable: Transport.TxIterable): Promise<void> {
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
}
