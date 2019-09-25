# @ndn/naming-convention-03

This package is part of [NDNts](https://yoursunny.com/p/NDNts/), Named Data Networking libraries for the modern web.

This package implements NDN naming conventions as specified in [NDN-TR-0022 draft](https://gitlab.com/named-data/tr-ndn-0022-naming-conventions/blob/76bf31b81b5935de93e5c429da1a4c8e0f469c83/typed.tex) and [Name Component Type Assignment rev12](https://redmine.named-data.net/projects/ndn-tlv/wiki/NameComponentType/12).

```ts
import { Keyword, Version, Segment } from "@ndn/naming-convention-03";
// We also have ByteOffset, Timestamp, and SequenceNum.

// other imports for examples
import { Name } from "@ndn/name";
import { strict as assert } from "assert";

// convention.create() returns a Component.
let name = new Name(["A", Keyword.create("metadata")]);
assert.equal(name.toString(), "/A/32=metadata");

// name.append() has an overload for convention component.
name = name.append(Version, 3);
assert.equal(name.toString(), "/A/32=metadata/35=%03");
name = name.append(Segment, 0);
assert.equal(name.toString(), "/A/32=metadata/35=%03/33=%00");

// convention.match() checks whether a Component follows the convention.
assert.equal(Segment.match(name.at(-1)), true);
assert.equal(Version.match(name.at(-1)), false);

// Or you can use component.is():
assert.equal(name.at(-1).is(Segment), true);
assert.equal(name.at(-1).is(Version), false);

// convention.parse() extracts the value from a Component.
assert.equal(Keyword.parse(name.at(-3)), "metadata");
assert.equal(Version.parse(name.at(-2)), 3);
assert.equal(Segment.parse(name.at(-1)), 0);
```
