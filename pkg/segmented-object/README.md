# @ndn/segmented-object

This package is part of [NDNts](https://yoursunny.com/p/NDNts/), Named Data Networking libraries for the modern web.

This package implements functions to publish and retrieve segmented objects.
`@ndn/cat` package is a command line program that uses this package, and serves as an example.

The consumer functionality:

* [X] supports version discovery via CanBePrefix.
* [X] supports version discovery by requesting metadata (in `@ndn/rdr` package).
* [ ] supports manifest.
* [X] allows specifying segment range.
* [X] supports segment numbers.
* [ ] supports byte offsets.
* [X] supports multiple naming conventions.
* [X] has Interest pipelining, congestion control, and loss recovery.
* [X] verifies packets with a `Verifier` (fixed key or trust schema).
* [X] emits events as segments arrive.
* [X] outputs in-order data chunks as a readable stream.
* [X] outputs completely reassembled object via Promise.

The producer functionality:

* [X] takes input from `Uint8Array`.
* [X] takes input from readable streams.
* [X] takes input from files (`Blob` in browser and Node.js, filename in Node.js).
* [X] generates segments of fixed size.
* [ ] generates segments of available data as Interest arrives, to minimize delivery latency.
* [X] responds to version discovery Interests with CanBePrefix.
* [X] responds to metadata requests (in `@ndn/rdr` package).
* [ ] generates manifest.
* [X] supports segment numbers.
* [ ] supports byte offsets.
* [X] supports multiple naming conventions.
* [X] signs packets with a `Signer` (fixed key or trust schema).
* [ ] reports when all segments have been retrieved at least once.
