import { Decoder } from "@ndn/tlv";
import { safeIter } from "@ndn/util";

import type { Transport } from "./transport";

export async function* rxFromPacketIterable(iterable: AsyncIterable<Uint8Array>): Transport.Rx {
  for await (const pkt of safeIter(iterable)) {
    const decoder = new Decoder(pkt);
    let tlv: Decoder.Tlv;
    try { tlv = decoder.read(); } catch { continue; }
    yield tlv;
  }
}
