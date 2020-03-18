import { AltUri as baseAltUri, AltUriPrinter } from "@ndn/packet";

import { ByteOffset, Segment, SequenceNum, Timestamp, Version } from "./conventions";

/** Print conventions from this package in alternate URI syntax. */
export const AltUri = new AltUriPrinter([
  Segment,
  ByteOffset,
  Version,
  Timestamp,
  SequenceNum,
  ...baseAltUri.conventions,
]);
