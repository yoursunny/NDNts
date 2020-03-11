import { Decoder, Encoder } from "@ndn/tlv";

import { Data, Name } from "..";

/** Obtain Data full name without being cached on Data packet. */
export async function getDataFullName(data: Data): Promise<Name> {
  const copy = new Decoder(Encoder.encode(data)).decode(Data);
  return copy.computeFullName();
}
