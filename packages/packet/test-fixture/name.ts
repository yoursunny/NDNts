import { Decoder, Encoder } from "@ndn/tlv";

import { Data, type Name } from "..";

/** Obtain Data full name without being cached on Data packet. */
export async function getDataFullName(data: Data): Promise<Name> {
  const copy = Decoder.decode(Encoder.encode(data), Data);
  return copy.computeFullName();
}
