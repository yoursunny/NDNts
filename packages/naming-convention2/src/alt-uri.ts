import { AltUri as baseAltUri, AltUriConverter } from "@ndn/packet";

import { ByteOffset2, ByteOffset3, Segment2, Segment3, SequenceNum2, SequenceNum3, Timestamp2, Timestamp3, Version2, Version3 } from "./conventions";

/** Print conventions (rev2) in alternate URI syntax. */
export const AltUri2 = new AltUriConverter([
  Segment2,
  ByteOffset2,
  Version2,
  Timestamp2.us,
  SequenceNum2,
  ...baseAltUri.conventions,
]);

/** Print conventions (rev3) in alternate URI syntax. */
export const AltUri3 = new AltUriConverter([
  Segment3,
  ByteOffset3,
  Version3,
  Timestamp3.us,
  SequenceNum3,
  ...baseAltUri.conventions,
]);

/** Print conventions (default format, currently rev3) in alternate URI syntax. */
export const AltUri = AltUri3;
