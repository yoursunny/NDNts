import { Decoder } from "@ndn/tlv";

import { safe } from "./safe";
import type { Transport } from "./transport";

export async function* rxFromPacketIterable(iterable: AsyncIterable<Uint8Array>): Transport.Rx {
  for await (const pkt of safe(iterable)) {
    const decoder = new Decoder(pkt);
    let tlv: Decoder.Tlv;
    try { tlv = decoder.read(); } catch { continue; }
    yield tlv;
  }
}
