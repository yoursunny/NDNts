# @ndn/l3pkt

This package is part of [NDNts](https://yoursunny.com/p/NDNts/), Named Data Networking libraries for the modern web.

This package implements **Interest** and **Data** types as specified in [NDN Packet Format v0.3](https://named-data.net/doc/NDN-packet-spec/0.3/).

```ts
import { Interest, Data, LLSign, LLVerify, canSatisfy, canSatisfySync } from "@ndn/l3pkt";

// other imports for examples
import { ImplicitDigest, Name } from "@ndn/name";
import { Decoder, Encoder } from "@ndn/tlv";
import { strict as assert } from "assert";
import { timingSafeEqual } from "crypto";
(async () => {
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
assert.equal(interest2.name.toString(), "/A");

// We got a Data type, too.
// You can set fields via constructor or setters.
const data = new Data(interest.name, Data.FreshnessPeriod(5000));
data.content = new TextEncoder().encode("hello NDNts");
```

## Low-Level Signing

```ts
// Every NDN Data must be signed.
// This package only provides a low-level API, which is crude to use directly.
// Nevertheless, this is how it works.

// Our signature would be 'DDDD'.
const expectedSignature = Uint8Array.of(0xDD, 0xDD);

// First, set a signing function on [LLSign.PENDING] property.
data[LLSign.PENDING] = async (input: Uint8Array): Promise<Uint8Array> => {
  return Promise.resolve(expectedSignature);
};

// Then, process the signing operations asynchronously.
await data[LLSign.PROCESS]();

// Finally, we can encode the Data and then decode it.
const dataWire = Encoder.encode(data);
const data2 = new Decoder(dataWire).decode(Data);

// Data signature should be verified.
// Again, this is a low-level API, so it would look difficult.

// Signed portion is already saved during decoding.
assert(data2[LLVerify.SIGNED] instanceof Uint8Array);

// Invoke [LLVerify.VERIFY] with a crypto verification function.
await data2[LLVerify.VERIFY]((input: Uint8Array, sig: Uint8Array) => {
  return new Promise<void>((resolve, reject) => {
    timingSafeEqual(sig, expectedSignature) ? resolve() : reject();
  });
});
// It's very important that you do not modify the Data if you need to verify its signature.
// Otherwise, you'll get errors or incorrect results.

// Now we can access the Content.
assert.equal(new TextDecoder().decode(data2.content), "hello NDNts");
```

## Implicit Digest

```ts
// To obtain implicit digest, we'll have to await, because WebCrypto API is async.
const digest = await data.computeImplicitDigest();
assert.equal(digest.length, 32);

// Full names are available, too.
const fullName = await data2.computeFullName();
assert.equal(fullName.length, data2.name.length + 1);
assert(fullName.at(-1).is(ImplicitDigest));

// After computation, implicit digest is cached on the Data instance,
// so we can get them without await:
const digest2 = data.getImplicitDigest();
const fullName2 = data.getFullName();
assert.equal(digest2, digest);
assert(typeof fullName2 !== "undefined");
assert.equal(fullName2!.toString(), fullName.toString());

// Note that these functions are only available after encoding or decoding.
// Calling them on a Data before encoding results in an error.
assert.throws(() => new Data().getImplicitDigest());
assert.throws(() => new Data().getFullName());
assert.rejects(new Data().computeImplicitDigest());
assert.rejects(new Data().computeFullName());
// Also, if you modify the Data after encoding or decoding, you'll get incorrect results.
// In short, only call them right after encoding or decoding.
```

## Interest-Data Matching

```ts
// To determine whether a Data satisfy an Interest, use canSatisfy or canSatisfySync.

// canSatisfySync returns a boolean:
assert.equal(canSatisfySync(interest, data), true);
const interest3 = new Interest("/B");
assert.equal(canSatisfySync(interest3, data), false);
// However, it does not support implicit digest, because digest computation is async:
const data3 = new Decoder(dataWire).decode(Data);
const interestWithFullName = new Interest(fullName);
assert(typeof canSatisfySync(interestWithFullName, data3) === "undefined");
// Unless the Data contains cached implicit digest:
assert.equal(canSatisfySync(interestWithFullName, data), true);

// canSatisfy returns a Promise that resolves to boolean, which can support implicit digest.
assert.equal(await canSatisfy(interestWithFullName, data3), true);
```

```ts
})();
```
