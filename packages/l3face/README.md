# @ndn/l3face

This package is part of [NDNts](https://yoursunny.com/p/NDNts/), Named Data Networking libraries for the modern web.

This package implements network layer face and transport base types.
Notable content includes:

* **Transport** type: transport base type,
* **StreamTransport** type: Node.js stream-based transport implementation.
* `rxFromStream` function: extract TLVs from continuous byte stream.
* `rxFromPacketIterable`: decode TLVs from datagrams.
* **L3Face** type: TLV-oriented network layer face, for use with logical Forwarder of `@ndn/fw` package.
* `L3Face.makeCreateFace` function: higher-order function that generates `*Transport.createFace` functions.
* **Bridge** type: pass packets between two logical forwarders, primarily for unit testing.

See `@ndn/node-transport` package for more explanation and examples.
