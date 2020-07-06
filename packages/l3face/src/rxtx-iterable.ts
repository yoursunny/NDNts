import { Decoder } from "@ndn/tlv";

import { Transport } from "./mod";

export async function* rxFromPacketIterable(iterable: AsyncIterable<Uint8Array>): Transport.Rx {
  for await (const pkt of iterable) {
    const decoder = new Decoder(pkt);
    let tlv: Decoder.Tlv;
    try { tlv = decoder.read(); } catch { continue; }
    yield tlv;
  }
}
