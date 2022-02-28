# @ndn/naming-convention1

This package is part of [NDNts](https://yoursunny.com/p/NDNts/), Named Data Networking libraries for the modern web.

This package implements NDN naming conventions based on marker octets.
This format, sometimes known as **rev1 format**, is specified in [NDN-TR-0022 revision 1](https://named-data.net/publications/techreports/ndn-tr-22-ndn-memo-naming-conventions/), published in 2014.
You should not use this outdated and obsolete format in new applications, except for accessing old data.
Use **rev3 format** from `@ndn/naming-convention2` package instead.

```ts
import { Version, Segment } from "@ndn/naming-convention1";
// We also have ByteOffset, Timestamp, and SequenceNum.

// other imports for examples
import { Name } from "@ndn/packet";
import { strict as assert } from "node:assert";

// Append name component with marker.
const name = new Name("/A")
  .append(Version, 3)
  .append(Segment, 0);
assert.equal(name.toString(), "/8=A/8=%FD%03/8=%00%00");

// Parse name component as marker.
assert.equal(name.at(-2).as(Version), 3);
assert.equal(name.at(-1).as(Segment), 0);
```
