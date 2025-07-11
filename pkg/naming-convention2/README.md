# @ndn/naming-convention2

This package is part of [NDNts](https://yoursunny.com/p/NDNts/), Named Data Networking libraries for the modern web.

This package implements NDN naming conventions based on typed components.

The current format, sometimes known as **rev3 format**, is specified in [NDN-TR-0022 revision 3](https://named-data.net/publications/techreports/ndn-tr-22-3-ndn-memo-naming-conventions/) and [Name Component Type Assignment rev29](https://redmine.named-data.net/projects/ndn-tlv/wiki/NameComponentType/29), published in 2021.
It is supported in most other libraries and recommended for new applications.

```ts
import { Keyword, Version, Segment, Timestamp, AltUri } from "@ndn/naming-convention2";

// other imports for examples
import { Name } from "@ndn/packet";
import assert from "node:assert/strict";
```

## Basic Usage

```ts
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
```

## Alternate URI Syntax

This package exports **AltUri** that implements alternate URI syntax for the naming conventions.
Make sure you are importing `AltUri` from this package, not from `@ndn/packet` package.

This feature is not in the regular `component.toString()` and `name.toString()` methods, because not every application would adopt this particular set of naming conventions.
It is incorrect to interpret "54=%03" as "version 3" everywhere, because in some applications it could mean something completely different.
Using `AltUri` from this package indicates you have adopted these naming conventions.

```ts
// Use AltUri.ofName() and AltUri.ofComponent() to print as alternate URI syntax.
assert.equal(AltUri.ofName(name), "/A/32=metadata/v=3/seg=0");
assert.equal(AltUri.ofComponent(name.at(2)), "v=3");

// Use AltUri.parseName() and AltUri.parseComponent() to parse from alternate URI syntax.
assert.ok(AltUri.parseName("/A/32=metadata/v=3/seg=0").equals(name));
assert.ok(AltUri.parseComponent("v=3").equals(name.at(2)));
```

## Timestamp Convention

**Timestamp** can be constructed from either number or Date object.
The number can be interpreted as either microseconds or milliseconds since Unix epoch.
The name component is always encoded as microseconds since Unix epoch per specification.

```ts
// Creating from number, interpreted as microseconds since Unix epoch:
const tsA = Timestamp.us.create(819170640000000);
// Creating from number, interpreted as milliseconds since Unix epoch:
const tsB = Timestamp.ms.create(819170640000);
// Creating from Date object:
const tsC = Timestamp.create(new Date("1995-12-17T03:24:00Z"));
// They shall create the same name component:
assert.ok(tsA.equals(tsB));
assert.ok(tsA.equals(tsC));

// Parsing into number as microseconds from Unix epoch:
assert.equal(Timestamp.us.parse(tsB), 819170640000000);
// Parsing into number as milliseconds from Unix epoch:
assert.equal(Timestamp.ms.parse(tsC), 819170640000);
// Call the Date constructor if you want a Date object:
assert.deepEqual(new Date(Timestamp.ms.parse(tsA)), new Date("1995-12-17T03:24:00Z"));
```

As shown in the examples, you can use `.us` sub-convention for microseconds unit or use `.ms` sub-convention for milliseconds unit.
The `Timestamp` convention is a shorthand for `Timestamp.ms`.

## Number Conventions

Number-based conventions, such as **Version** and **Segment**, can be constructed from and parsed into either number or bigint.

```ts
// Creating from number:
const verA = Version.create(7);
// Creating from bigint:
const verB = Version.create(7n);
// They shall create the same name component:
assert.ok(verA.equals(verB));

// Parsing into number:
assert.equal(Version.parse(verB), 7);
// Parsing into bigint:
assert.equal(Version.big.parse(verB), 7n);
```

As shown in the examples, you can use `.big` sub-convention to parse as bigint.
This is supported in Version, Segment, ByteOffset, SequenceNum, and GenericNumber.
However, this is not supported in Timestamp.

**GenericNumber** is a number-based convention that encodes a GenericNameComponent with NonNegativeInteger as TLV-VALUE.
Despite not part of the naming convention specification, it is adopted by several NDN protocols, so that it is included for convenience.

## Legacy rev2 Format

This package also implements **rev2 format**, as specified in [NDN-TR-0022 revision 2](https://named-data.net/publications/techreports/ndn-tr-22-2-ndn-memo-naming-conventions/) and [Name Component Type Assignment rev17](https://redmine.named-data.net/projects/ndn-tlv/wiki/NameComponentType/17), published in 2019.
Import `Segment2`, `ByteOffset2`, `Version2`, `Timestamp2`, `SequenceNum2`, `AltUri2` to access this format.
You should not use this outdated and obsolete format in new applications, except for accessing old data.
