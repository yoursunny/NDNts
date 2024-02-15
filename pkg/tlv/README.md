# @ndn/tlv

This package is part of [NDNts](https://yoursunny.com/p/NDNts/), Named Data Networking libraries for the modern web.

This package implements Type-Length-Value structure encoder and decoder as specified in [NDN Packet Format v0.3](https://docs.named-data.net/NDN-packet-spec/0.3/tlv.html).
It has full support for TLV evolvability guidelines.

```ts
import { Encoder, Decoder, EvDecoder, NNI, StructBuilder, StructFieldNNI, StructFieldText } from "@ndn/tlv";

// other imports for examples
import { Name, TT as l3TT, StructFieldName } from "@ndn/packet";
import assert from "node:assert/strict";
```

## Encoder

The **Encoder** *prepend*s encodable items to an internal `ArrayBuffer`.
It reallocates a larger buffer when necessary.

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

// `Encoder.encode()` is a shortcut for encoding one item and obtaining the output:
const wireB = Encoder.encode(new Name("/B"));
assert.deepEqual(wireB, Uint8Array.of(0x07, 0x03, 0x08, 0x01, 0x42));
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
assert.equal(decoder.eof, false);
// If you continue reading, you get an error due to incomplete TLV.
assert.throws(() => decoder.read());

// Decode into TLV object:
decoder = new Decoder(Uint8Array.of(0x07, 0x03, 0x08, 0x01, 0x41));
const nameA = decoder.decode(Name);
assert(nameA instanceof Name);
assert.equal(nameA.toString(), "/8=A");
// We have fully consumed the buffer.
assert.equal(decoder.eof, true);

// `Decoder.decode()` is a shortcut for decoding one item and checking for EOF.
const nameB = Decoder.decode(wireB, Name);
assert(nameB instanceof Name);
assert.equal(nameB.toString(), "/8=B");
// It throws if there's junk after the TLV.
assert.throws(() => Decoder.decode(Uint8Array.of(...wireB, 0xFF), Name));
```

## EvDecoder

The **EvDecoder** is a decoder that is aware of TLV evolvability guidelines.
It's used to implement decoding functions of TLV objects, such as `Interest.decodeFrom`.

Suppose we want to decode `Adjacency` type in [NLSR's LSDB Dataset](https://redmine.named-data.net/projects/nlsr/wiki/LSDB_DataSet/13):

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
  ...l3TT,
  Adjacency: 0x84,
  Cost: 0x8C,
  Uri: 0x8D,
} as const;

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

// We can decode it with the EVD.
const adjacency = EVD.decode(new Adjacency(), new Decoder(adjacencyWire));
assert.equal(adjacency.name.toString(), "/8=A");
assert.equal(adjacency.uri, "B");
assert.equal(adjacency.cost, 128);
```

## StructBuilder

The **StructBuilder** is a helper for defining a class that represents a TLV structure.
It allows you to define the typing, constructor, encoder, and decoder, while writing each field only once.

```ts
// Create a StructBuilder and add the fields.
const buildAdj = new StructBuilder("Adjacency", TT.Adjacency)
  .add(TT.Name, "name", StructFieldName, { required: true })
  .add(TT.Uri, "uri", StructFieldText, { required: true })
  .add(TT.Cost, "cost", StructFieldNNI, { required: true });
// You should call .add() on each successive return value, and save the last return value into the
// builder variable. This gradually builds up the typing of the TLV class.
// WRONG EXAMPLE:
//   const builder = new StructBuilder();
//   builder.add(...);
//   builder.add(...);
// In the wrong example, typing information is not saved into the builder variable.

// Declare a class to represent the Adjacency type, inheriting from a base class supplied by the builder.
class Adj extends buildAdj.baseClass<Adj>() {}

// Assign the subclass to the builder (otherwise the decoding function will not work).
buildAdj.subclass = Adj;

// We can construct an instance and encode it.
const adj0 = new Adj();
adj0.name = new Name("/A");
adj0.uri = "B";
adj0.cost = 128;
const adj0Wire = Encoder.encode(adj0);
assert.deepEqual(adj0Wire, Uint8Array.of(
  0x84, 0x0B,
  0x07, 0x03, 0x08, 0x01, 0x41, // Name
  0x8D, 0x01, 0x42, // Uri
  0x8C, 0x01, 0x80, // Cost
));

// We can decode the wire encoding.
const adj1 = Decoder.decode(adjacencyWire, Adj);
assert.equal(adj1.name.toString(), "/8=A");
assert.equal(adj1.uri, "B");
assert.equal(adj1.cost, 128);
```

**StructBuilder** enables rapid development of TLV based structures, but is less flexible than writing code with Encoder, Decoder, and EvDecoder.
Some limitations are:

* You cannot write JSDoc for individual fields.
* You cannot decode multiple TLV-TYPE numbers into the same field (counterexample: `Name` with typed name components).
* You cannot encode the structure with different TLV-TYPE numbers (counterexample: `SigInfo` encoded as either ISigInfo or DSigInfo).
