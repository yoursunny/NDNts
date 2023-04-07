# @ndn/packet

This package is part of [NDNts](https://yoursunny.com/p/NDNts/), Named Data Networking libraries for the modern web.

This package implements **Name**, **Interest**, and **Data** types as specified in [NDN Packet Format v0.3](https://docs.named-data.net/NDN-packet-spec/0.3/).

```ts
import { TT, Name, Component, ImplicitDigest, AltUri, Interest, Data, digestSigning } from "@ndn/packet";

// other imports for examples
import { Decoder, Encoder } from "@ndn/tlv";
import { fromUtf8, toUtf8 } from "@ndn/util";
import assert from "node:assert/strict";
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
const name1 = new Name("/localhost/2020=NDNts/rocks");
// Construct from a list of components, or strings to create components.
const name2 = new Name([compA, compB, "C", compMetadata]);
// Name parsing functions expect URI in canonical format. They DO NOT recognize alternate/pretty
// URI syntax other than allow omitting "8=" prefix of GenericNameComponent.

// You can always convert a name back to its URI in canonical format.
assert.equal(name1.toString(), "/8=localhost/2020=NDNts/8=rocks");
assert.equal(name2.toString(), "/8=A/8=B/8=C/32=metadata");

// AltUri.ofName() function allows printing a name as alternate/pretty URI syntax.
assert.equal(AltUri.ofName(name1), "/localhost/2020=NDNts/rocks");
assert.equal(AltUri.ofName(name2), "/A/B/C/32=metadata");
// AltUri.ofName() from this package only recognizes 0x01, 0x02, and 0x08 types. If you are using
// naming conventions from @ndn/naming-convention2 package, use the AltUri from that package.
// This feature isn't in the regular name.toString(), so that it does not unnecessarily increase
// browser bundle size in applications that do not need it.

// It's crucial to know how many name components you have.
assert.equal(name1.length, 3);
assert.equal(name2.length, 4);

// You can get an individual name component.
const name1comp1 = name1.get(1);
// It would return 'undefined' if the component does not exist, so we have to check.
if (name1comp1 === undefined) {
  assert.fail(); // This isn't supposed to happen for this name, though.
} else {
  assert.equal(name1comp1.text, "NDNts");
}

// To save the 'undefined' check, use at(i). It throws if the component does not exist.
assert.throws(() => name1.at(5));
assert.equal(name1.at(1).text, "NDNts");

// Slice the name to obtain part of it.
const name1sliced = name1.slice(1, 3);
assert.equal(name1sliced.toString(), "/2020=NDNts/8=rocks");

// Or, get the prefix.
const name2prefix = name2.getPrefix(3);
assert.equal(name2prefix.toString(), "/8=A/8=B/8=C");

// Indexing from the back is supported, too.
assert.equal(name1.at(-1).text, "rocks");
assert.equal(name1.slice(-2).toString(), "/2020=NDNts/8=rocks");
assert.equal(name2.getPrefix(-1).toString(), "/8=A/8=B/8=C");

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
assert(name1modified.toString(), "/8=localhost/2020=NDNts/8=rocks/8=is/8=awesome");
assert(name1.toString(), "/8=localhost/2020=NDNts/8=rocks"); // unchanged
```

## Layer-3 Packet Types: Interest and Data

```ts
// We have an Interest type, of course.
// You can set fields via constructor or setters.
const interest = new Interest(new Name("/A"), Interest.CanBePrefix, Interest.MustBeFresh);
interest.canBePrefix = false;
interest.lifetime = 2000;

// Encode and decode the Interest.
const interestWire = Encoder.encode(interest);
const interest2 = new Decoder(interestWire).decode(Interest);
assert.equal(interest2.name.toString(), "/8=A");

// We got a Data type, too.
// You can set fields via constructor or setters.
const data = new Data(interest.name, Data.FreshnessPeriod(5000));
data.content = toUtf8("hello NDNts");
```

## Signing and Verification

```ts
// Every NDN Data must be signed.
// This package provides the low-level API, and an implementation of SHA256 digest signing.
// Other signature types are in @ndn/keychain package.

// Sign the Data. The API is asynchronous as required by WebCrypto.
await digestSigning.sign(data);

// After signing, we can encode the Data.
const dataWire = Encoder.encode(data);

// And then decode it.
const data2 = new Decoder(dataWire).decode(Data);

// Data signature should be verified.
// If the verify() function does not throw, it means the signature is good.
await digestSigning.verify(data);

// It's very important that you do not modify the Data if you need to verify its signature.
// Otherwise, you'll get errors or incorrect results.

// After verifying, we can access the Content.
assert.equal(fromUtf8(data2.content), "hello NDNts");
```

## Implicit Digest

```ts
// To obtain implicit digest, we'll have to await, because it internally uses WebCrypto, which is async.
const digest = await data.computeImplicitDigest();
assert.equal(digest.length, 32);

// Full names are available, too.
const fullName = await data2.computeFullName();
assert.equal(fullName.length - 1, data2.name.length);
assert(fullName.at(-1).is(ImplicitDigest));

// After computation, implicit digest is cached on the Data instance,
// so we can get them without await:
const digest2 = data.getImplicitDigest();
const fullName2 = data.getFullName();
assert.equal(digest2, digest);
assert(fullName2 !== undefined);
assert.equal(fullName2.toString(), fullName.toString());

// Note that you cannot modify the Data after encoding or decoding,
// or you'll get incorrect implicit digest results.
```

## Interest-Data Matching

```ts
// data.canSatisfy(interest) determines whether a Data satisfy an Interest.
// This is an async function because it potentially involves computing the implicit digest.

assert.equal(await data.canSatisfy(interest), true);
const interest3 = new Interest("/B");
assert.equal(await data.canSatisfy(interest3), false);
const data3 = new Decoder(dataWire).decode(Data);
const interestWithFullName = new Interest(fullName);
assert.equal(await data.canSatisfy(interestWithFullName), true);
```
