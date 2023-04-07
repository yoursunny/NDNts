# @ndn/tlv

This package is part of [NDNts](https://yoursunny.com/p/NDNts/), Named Data Networking libraries for the modern web.

This package implements Type-Length-Value structure encoder and decoder as specified in [NDN Packet Format v0.3](https://docs.named-data.net/NDN-packet-spec/0.3/tlv.html).
It has full support for TLV evolvability guidelines.

```ts
import { Encoder, Decoder, EvDecoder, NNI } from "@ndn/tlv";

// other imports for examples
import { Name, TT as nameTT } from "@ndn/packet";
import assert from "node:assert/strict";
```

## Encoder

The **Encoder** has an internal buffer of `Uint8Array` type.
It prepends any encodable items to the internal buffer, and reallocates a larger buffer when necessary.

```ts
// Encode TLV object that implements EncodableObj interface:
let encoder = new Encoder();
encoder.encode(new Name("/A"));
// Look at the output:
assert.deepEqual(encoder.output, Uint8Array.of(0x07, 0x03, 0x08, 0x01, 0x41));

// Prepend a TLV structure with specified TLV-TYPE and TLV-VALUE:
encoder = new Encoder();
encoder.encode([0xB0, Uint8Array.of(0xC0, 0xC1)]);
assert.deepEqual(encoder.output, Uint8Array.of(0xB0, 0x02, 0xC0, 0xC1));

// Prepend a non-negative integer
encoder.encode(NNI(0x200110));
// We are using the same Encoder instance, so it gets prepended:
assert.deepEqual(encoder.output, Uint8Array.of(0x00, 0x20, 0x01, 0x10, 0xB0, 0x02, 0xC0, 0xC1));

// Put multiple encodable items in TLV-VALUE:
encoder = new Encoder();
encoder.encode([0xB0, Uint8Array.of(0xC0, 0xC1), new Name("/A")]);
assert.deepEqual(encoder.output,
  Uint8Array.of(0xB0, 0x07, 0xC0, 0xC1, 0x07, 0x03, 0x08, 0x01, 0x41));
```

## Decoder

The **Decoder** is a basic sequential decoder.

```ts
// Read Type-Length-Value manually:
let decoder = new Decoder(Uint8Array.of(0x08, 0x01, 0x41, 0xFF));
const { type, length, value } = decoder.read();
assert.equal(type, 0x08);
assert.equal(length, 1);
assert.deepEqual(value, Uint8Array.of(0x41));
// The remaining [0xFF] is still in the buffer.
// If you continue reading, you get an error due to incomplete TLV.
assert.throws(() => decoder.read());

// Decode into TLV object:
decoder = new Decoder(Uint8Array.of(0x07, 0x03, 0x08, 0x01, 0x41));
const name = decoder.decode(Name);
assert(name instanceof Name);
assert.equal(name.toString(), "/8=A");
```

## EvDecoder

The **EvDecoder** is a decoder that is aware of TLV evolvability guidelines.
It's used to implement decoding functions of TLV objects, such as `Interest.decodeFrom`.

Suppose we want to decode [NLSR's LSDB Dataset](https://redmine.named-data.net/projects/nlsr/wiki/LSDB_DataSet/11):

```abnf
Adjacency = ADJACENCY-TYPE TLV-LENGTH
              Name
              Uri
              Cost
Uri = URI-TYPE TLV-LENGTH *VCHAR
Cost = COST-TYPE TLV-LENGTH nonNegativeInteger

ADJACENCY-TYPE = 0x84
URI-TYPE = 0x8D
COST-TYPE = 0x8C
```

```ts
// Declare a class to represent this type.
class Adjacency {
  public name = new Name();
  public uri = "";
  public cost = 0;
}

// Declare constants for TLV-TYPE numbers.
const TT = {
  ...nameTT,
  Adjacency: 0x84,
  Cost: 0x8C,
  Uri: 0x8D,
};

// Create the decoder.
const EVD = new EvDecoder<Adjacency>("Adjacency", TT.Adjacency)
  .add(TT.Name, (t, { decoder }) => t.name = decoder.decode(Name), { required: true })
  .add(TT.Uri, (t, { text }) => t.uri = text, { required: true })
  .add(TT.Cost, (t, { nni }) => t.cost = nni, { required: true });
// Each rule declares a possible sub TLV.
// They are added in the order of expected appearance.
// The callback receives two arguments:
// (1) the target object we are decoding into, so that EVD instances are reusable;
// (2) a Decoder.Tlv structure, where we can selectively access just the TLV-VALUE, the whole TLV,
//     the TLV-VALUE as a Decoder, the whole TLV as a Decoder, etc.

// Suppose we receive this encoded TLV:
const adjacencyWire = Uint8Array.of(
  0x84, 0x0D,
  0x07, 0x03, 0x08, 0x01, 0x41, // Name
  0x8D, 0x01, 0x42, // Uri
  0xF0, 0x00, // unrecognized non-critical TLV-TYPE, ignored
  0x8C, 0x01, 0x80, // Cost
);
const adjacencyDecoder = new Decoder(adjacencyWire);

// We can decode it with the EVD.
const adjacency = EVD.decode(new Adjacency(), adjacencyDecoder);
assert.equal(adjacency.name.toString(), "/8=A");
assert.equal(adjacency.uri, "B");
assert.equal(adjacency.cost, 128);
```
