# @ndn/name

This package is part of [NDNts](https://yoursunny.com/p/NDNts/), Named Data Networking libraries for the modern web.

```ts
import { Name, Component, TT } from "@ndn/name";

// other imports for examples
import { strict as assert } from "assert";
```

## Name Component

```ts
// Name components are immutable. Once it's created, you can never change it.
// Construct a Component from its TLV-TYPE and TLV-VALUE.
const compA = new Component(TT.GenericNameComponent, Uint8Array.of(0x41));
// Create a Component from URI representation.
const compB = Component.from("B");
// Typed components are supported, too.
const compMetadata = Component.from("32=metadata");

// We can retrieve TLV-TYPE, TLV-LENGTH, and TLV-VALUE.
assert.equal(compA.type, TT.GenericNameComponent);
assert.equal(compB.type, TT.GenericNameComponent);
assert.equal(compMetadata.type, 0x20);

assert.equal(compA.length, 1);
assert.equal(compB.length, 1);
assert.equal(compMetadata.length, 8);

assert.deepEqual(compA.value, Uint8Array.of(0x41));
assert.deepEqual(compB.value, Uint8Array.of(0x42));
assert.deepEqual(compMetadata.value, Uint8Array.of(0x6D, 0x65, 0x74, 0x61, 0x64, 0x61, 0x74, 0x61));

// For convenience, we can retrieve TLV-VALUE as text string, too.
assert.equal(compA.text, "A");
assert.equal(compB.text, "B");
assert.equal(compMetadata.text, "metadata");

// Components are comparable.
assert.equal(compA.compare(compA), Component.CompareResult.EQUAL);
assert.equal(compA.compare(compB), Component.CompareResult.LT);
assert.equal(compB.compare(compA), Component.CompareResult.GT);
assert.equal(compA.equals(compA), true);
assert.equal(compA.equals(compB), false);
```

## Name

```ts
// Names, like components, are immutable.
// Construct from URI.
const name1 = new Name("/localhost/NDNts/rocks");
// Construct from a list of components, or strings to create components.
const name2 = new Name([compA, compB, "C", compMetadata]);

// You can always convert a name back to its URI.
assert.equal(name1.toString(), "/localhost/NDNts/rocks");
assert.equal(name2.toString(), "/A/B/C/32=metadata");

// It's crucial to know how many name components you have.
assert.equal(name1.length, 3);
assert.equal(name2.length, 4);

// You can get an individual name component.
const name1comp1 = name1.get(1);
// It would return 'undefined' if the component does not exist, so we have to check.
if (typeof name1comp1 === "undefined") {
  assert.fail(); // This isn't supposed to happen for this name, though.
} else {
  assert.equal(name1comp1.text, "NDNts");
}

// To save the 'undefined' check, use at(i). It throws if the component does not exist.
assert.throws(() => name1.at(5));
assert.equal(name1.at(1).text, "NDNts");

// Slice the name to obtain part of it.
const name1sliced = name1.slice(1, 3);
assert.equal(name1sliced.toString(), "/NDNts/rocks");

// Or, get the prefix.
const name2prefix = name2.getPrefix(3);
assert.equal(name2prefix.toString(), "/A/B/C");

// Indexing from the back is supported, too.
assert.equal(name1.at(-1).text, "rocks");
assert.equal(name1.slice(-2).toString(), "/NDNts/rocks");
assert.equal(name2.getPrefix(-1).toString(), "/A/B/C");

// Names are comparable.
const nameAB = new Name("/A/B");
const nameABB = new Name("/A/B/B");
const nameABC = new Name("/A/B/C");
const nameABD = new Name("/A/B/D");
const nameABCD = new Name("/A/B/C/D");
assert.equal(nameABC.equals(nameABC), true);
assert.equal(nameABC.equals(nameABD), false);
assert.equal(nameABC.compare(nameABC), Name.CompareResult.EQUAL);
assert.equal(nameABC.compare(nameABB), Name.CompareResult.GT);
assert.equal(nameABC.compare(nameABD), Name.CompareResult.LT);
assert.equal(nameABC.compare(nameABCD), Name.CompareResult.LPREFIX);
assert.equal(nameABC.compare(nameAB), Name.CompareResult.RPREFIX);

// LPREFIX means the first name is a strict prefix of the second name.
// It implies the first name is less than the second name.
// If you only care about the order, check if the result is less than zero.
assert(nameABC.compare(nameABCD) < 0);

// RPREFIX means the second name is a strict prefix of the first name.
// It implies the first name is greater than the second name.
// If you only care about the order, check if the result is greater than zero.
assert(nameABC.compare(nameAB) > 0);

// If you want to know whether a name is a prefix of another, it's EQUAL or LPREFIX.
// But we got a faster way:
assert.equal(nameABC.isPrefixOf(nameABC), true);
assert.equal(nameABC.isPrefixOf(nameABCD), true);
assert.equal(nameABC.isPrefixOf(nameAB), false);

// I said names are immutable, but you can surely modify them to get a new Name.
const name1modified = name1.getPrefix(-1).append("is", "awesome");
assert(name1modified.toString(), "/localhost/NDNts/rocks/is/awesome");
assert(name1.toString(), "/localhost/NDNts/rocks"); // unchanged
```
