import { AltUri as baseAltUri, AltUriConverter } from "@ndn/packet";

import { ByteOffset2, ByteOffset3, Segment2, Segment3, SequenceNum2, SequenceNum3, Timestamp2, Timestamp3, Version2, Version3 } from "./conventions";

/** Print conventions from this package in alternate URI syntax. */
export const AltUri = new AltUriConverter([
  Segment2,
  Segment3,
  ByteOffset2,
  ByteOffset3,
  Version2,
  Version3,
  Timestamp2.us,
  Timestamp3.us,
  SequenceNum2,
  SequenceNum3,
  ...baseAltUri.conventions,
]);
