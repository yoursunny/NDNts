# @ndn/l3pkt

This package is part of [NDNts](https://yoursunny.com/p/NDNts/), Named Data Networking libraries for the modern web.

This package implements **Interest** and **Data** types as specified in [NDN Packet Format v0.3](https://named-data.net/doc/NDN-packet-spec/0.3/).

```ts
import { Interest, Data, LLSign, LLVerify } from "@ndn/l3pkt";

// other imports for examples
import { Name } from "@ndn/name";
import { Decoder, Encoder } from "@ndn/tlv";
import { strict as assert } from "assert";
import { timingSafeEqual } from "crypto";
(async () => {
```

## Layer-3 packet types: Interest and Data

```ts
// We have an Interest type, of course.
// You can set Interest fields via constructor or setters.
const interest = new Interest(new Name("/A"), Interest.CanBePrefix, Interest.MustBeFresh);
interest.canBePrefix = false;
interest.lifetime = 2000;

// Encode and decode the Interest.
const interestWire = Encoder.encode(interest);
const interest2 = new Decoder(interestWire).decode(Interest);
assert.equal(interest2.name.toString(), "/A");

// We got a Data type, too.
// You can set Interest fields via constructor or setters.
const data = new Data();
data.name = interest.name;
data.freshnessPeriod = 5000;
data.content = new TextEncoder().encode("hello NDNts");
```

## Low-Level Signing

```ts
// Every NDN Data must be signed.
// This package only provides a low-level API, which is crude to use directly.
// Nevertheless, this is how it works.

// Our signature would be 'DDDD'.
const expectedSignature = new Uint8Array([0xDD, 0xDD]);

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
// Again, this is a low-level API, so it would look hard.

// Signed portion is already saved during decoding.
assert(data2[LLVerify.SIGNED] instanceof Uint8Array);

// Invoke [LLVerify.VERIFY] with a crypto verification function.
await data2[LLVerify.VERIFY]((input: Uint8Array, sig: Uint8Array) => {
  return new Promise<void>((resolve, reject) => {
    timingSafeEqual(sig, expectedSignature) ? resolve() : reject();
  });
});

// Now we can access the Content.
assert.equal(new TextDecoder().decode(data2.content), "hello NDNts");
```

```ts
})();
```
