# @ndn/naming-convention1

This package is part of [NDNts](https://yoursunny.com/p/NDNts/), Named Data Networking libraries for the modern web.

This package implements 2014-version NDN naming conventions as specified in [NDN-TR-0022 revision 1](https://named-data.net/publications/techreports/ndn-tr-22-ndn-memo-naming-conventions/).
For 2019-version naming conventions, use `@ndn/naming-convention2` package.

```ts
import { Version, Segment } from "@ndn/naming-convention1";
// We also have ByteOffset, Timestamp, and SequenceNum.

// other imports for examples
import { Name } from "@ndn/packet";
import { strict as assert } from "assert";

// Append name component with marker.
const name = new Name("/A")
  .append(Version, 3)
  .append(Segment, 0);
assert.equal(name.toString(), "/A/%FD%03/%00%00");

// Parse name component as marker.
assert.equal(name.at(-2).as(Version), 3);
assert.equal(name.at(-1).as(Segment), 0);
```
