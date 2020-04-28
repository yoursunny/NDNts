# @ndn/segmented-object

This package is part of [NDNts](https://yoursunny.com/p/NDNts/), Named Data Networking libraries for the modern web.

This package implements functions to publish and retrieve segmented objects.
`@ndn/cat` package is a command line program that uses this package, and serves as an example.

The consumer functionality:

* [X] supports version discovery via CanBePrefix.
* [X] supports version discovery via RDR protocol (in `@ndn/rdr` package).
* [ ] supports manifest.
* [X] allows specifying segment range.
* [X] supports segment numbers.
* [ ] supports byte offsets.
* [X] supports multiple naming conventions.
* [X] has Interest pipelining, congestion control, and loss recovery.
* [ ] verifies packets with trust schema.
* [X] emits events as segments arrive.
* [X] outputs in-order data chunks as a readable stream.
* [X] outputs completely reassembled object via Promise.

The producer functionality:

* [X] takes input from `Uint8Array`.
* [X] takes input from readable streams.
* [X] takes input from files (filename in Node.js, `Blob` in browser).
* [X] generates segments of fixed size.
* [ ] generates segments of available data as Interest arrives, to minimize delivery latency.
* [X] responds to version discovery Interests with CanBePrefix.
* [X] responds to RDR protocol (in `@ndn/rdr` package).
* [ ] generates manifest.
* [X] supports segment numbers.
* [ ] supports byte offsets.
* [X] supports multiple naming conventions.
* [X] signs packets with fixed key.
* [ ] signs packets with trust schema.
* [ ] reports when all segments have been retrieved at least once.
