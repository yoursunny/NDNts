# @ndn/naming-convention-03

This package is part of [NDNts](https://yoursunny.com/p/NDNts/), Named Data Networking libraries for the modern web.

This package implements Type-Length-Value structure encoder and decoder as specified in [NDN Packet Format v0.3](https://named-data.net/doc/NDN-packet-spec/0.3/tlv.html).
It has full support for TLV evolvability guidelines.

```ts
import { Encoder, Decoder, NNI } from "@ndn/tlv";

// other imports for examples
import { Name } from "@ndn/name";
import { strict as assert } from "assert";
```

## Encoder

The **Encoder** has an internal buffer of `Uint8Array` type.
It prepends any encodable items to the internal buffer, and reallocates a larger buffer when necessary.

```ts
// Encode TLV object that implements EncodableObj interface:
let encoder = new Encoder();
encoder.encode(new Name("/A"));
// Look at the output:
assert.deepEqual(encoder.output, new Uint8Array([0x07, 0x03, 0x08, 0x01, 0x41]));

// Prepend a TLV structure with specified TLV-TYPE and TLV-VALUE:
encoder = new Encoder();
encoder.encode([0xB0, new Uint8Array([0xC0, 0xC1])]);
assert.deepEqual(encoder.output, new Uint8Array([0xB0, 0x02, 0xC0, 0xC1]));

// Prepend a non-negative integer
encoder.encode(NNI(0x200110));
// We are using the same Encoder instance, so it gets prepended:
assert.deepEqual(encoder.output, new Uint8Array([0x00, 0x20, 0x01, 0x10, 0xB0, 0x02, 0xC0, 0xC1]));

// Put multiple encodable items in TLV-VALUE:
encoder = new Encoder();
encoder.encode([0xB0, new Uint8Array([0xC0, 0xC1]), new Name("/A")]);
assert.deepEqual(encoder.output,
                 new Uint8Array([0xB0, 0x07, 0xC0, 0xC1, 0x07, 0x03, 0x08, 0x01, 0x41]));
```

## Streaming Decoder

The **Decoder** is a basic streaming decoder.

```ts
// Read Type-Length-Value manually:
let decoder = new Decoder(new Uint8Array([0x08, 0x01, 0x41, 0xFF]));
const { type, length, value } = decoder.read();
assert.equal(type, 0x08);
assert.equal(length, 1);
assert.deepEqual(value, new Uint8Array([0x41]));
// The remaining [0xFF] is still in the buffer.
// If you continue reading, you get an error due to incomplete TLV.
assert.throws(() => decoder.read());

// Decode into TLV object:
decoder = new Decoder(new Uint8Array([0x07, 0x03, 0x08, 0x01, 0x41]));
const name = decoder.decode(Name);
assert(name instanceof Name);
assert.equal(name.toString(), "/A");
```

## Evolvability Aware Decoder

The **EvDecoder** is a powerful decoder that can follow TLV evolvability guidelines.
It's mainly used to implement decoding functions of TLV objects, such as `Interest.decodeFrom`.
Look for these implementations on how it can be used.
