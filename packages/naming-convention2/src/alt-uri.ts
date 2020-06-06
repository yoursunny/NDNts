import { AltUri as baseAltUri, AltUriConverter } from "@ndn/packet";

import { ByteOffset, Segment, SequenceNum, Timestamp, Version } from "./conventions";

/** Print conventions from this package in alternate URI syntax. */
export const AltUri = new AltUriConverter([
  Segment,
  ByteOffset,
  Version,
  Timestamp,
  SequenceNum,
  ...baseAltUri.conventions,
]);
