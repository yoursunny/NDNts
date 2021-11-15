# @ndn/naming-convention2

This package is part of [NDNts](https://yoursunny.com/p/NDNts/), Named Data Networking libraries for the modern web.

This package implements NDN naming conventions based on typed components.
It supports two formats:

* **rev2 format**, as specified in [NDN-TR-0022 revision 2](https://named-data.net/publications/techreports/ndn-tr-22-2-ndn-memo-naming-conventions/) and [Name Component Type Assignment rev17](https://redmine.named-data.net/projects/ndn-tlv/wiki/NameComponentType/17) published in 2019.
* **rev3 format**, as specified in [NDN-TR-0022 revision 3](https://named-data.net/publications/techreports/ndn-tr-22-3-ndn-memo-naming-conventions/) and [Name Component Type Assignment rev28](https://redmine.named-data.net/projects/ndn-tlv/wiki/NameComponentType/28) published in 2021.

You may select a revision by importing different identifiers:

* `Keyword` is the same in both **rev2 format** and **rev3 format**.
* `Segment2`, `ByteOffset2`, `Version2`, `Timestamp2`, `SequenceNum2`, `AltUri2` refer to **rev2 format**.
* `Segment3`, `ByteOffset3`, `Version3`, `Timestamp3`, `SequenceNum3`, `AltUri3` refer to **rev3 format**.
* `Segment`, `ByteOffset`, `Version`, `Timestamp`, `SequenceNum`, `AltUri` refer to the default **rev3 format**.

The **rev3 format** is the current specification and recommended for new applications.
However, most other implementations and previously generated Data may still be using **rev2 format**.

```ts
import { Keyword, Version, Segment, AltUri } from "@ndn/naming-convention2";
// We also have ByteOffset, Timestamp, SequenceNum, as well identifiers to select rev2 or rev3 format.

// other imports for examples
import { Name } from "@ndn/packet";
import { strict as assert } from "node:assert";

// convention.create() returns a Component.
let name = new Name(["A", Keyword.create("metadata")]);
assert.equal(name.toString(), "/8=A/32=metadata");

// name.append() has an overload for convention component.
name = name.append(Version, 3);
assert.equal(name.toString(), "/8=A/32=metadata/54=%03");
name = name.append(Segment, 0);
assert.equal(name.toString(), "/8=A/32=metadata/54=%03/50=%00");

// convention.match() checks whether a Component follows the convention.
assert.equal(Segment.match(name.at(-1)), true);
assert.equal(Version.match(name.at(-1)), false);

// Or you can use component.is().
assert.equal(name.at(-1).is(Segment), true);
assert.equal(name.at(-1).is(Version), false);

// convention.parse() extracts the value from a Component.
assert.equal(Keyword.parse(name.at(-3)), "metadata");
assert.equal(Version.parse(name.at(-2)), 3);
assert.equal(Segment.parse(name.at(-1)), 0);

// Or you can use component.as().
assert.equal(name.at(-3).as(Keyword), "metadata");
assert.equal(name.at(-2).as(Version), 3);
assert.equal(name.at(-1).as(Segment), 0);

// If you need alternate URI syntax, use AltUri.ofName() or AltUri.ofComponent().
// Make sure you are importing AltUri from this package, not from @ndn/packet package.
assert.equal(AltUri.ofName(name), "/A/32=metadata/v=3/seg=0");
assert.equal(AltUri.ofComponent(name.at(2)), "v=3");
// This feature is not in the regular component.toString() and name.toString() methods,
// because not every application would adopt this particular set of naming conventions.
// It is incorrect to interpret "54=%03" as a "version 3" everywhere, because in some application
// it could mean something completely different.
// Using AltUri from this package indicates you have adopted these naming conventions.

// Use AltUri.parseName() and AltUri.parseComponent() to parse from alternate URI syntax.
assert(AltUri.parseName("/A/32=metadata/v=3/seg=0").equals(name));
assert(AltUri.parseComponent("v=3").equals(name.at(2)));
```
