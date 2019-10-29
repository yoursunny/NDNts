# @ndn/segmented-object

This package is part of [NDNts](https://yoursunny.com/p/NDNts/), Named Data Networking libraries for the modern web.

This package implements functions to publish and retrieve segmented objects.

The `fetch` function:

* [X] supports version discovery via CanBePrefix.
* [ ] supports version discovery via RDR protocol.
* [ ] supports manifest.
* [ ] allows specifying segment range.
* [X] supports segment numbers.
* [ ] supports byte offsets.
* [X] supports multiple naming conventions.
* [ ] has Interest pipelining, congestion control, and loss recovery.
* [ ] verifies packets with trust schema.
* [X] emits events as segments arrive.
* [X] outputs in-order data chunks as a readable stream.
* [X] outputs completely reassembled object via Promise.

The `serve` function:

* [X] generates segments of fixed size.
* [ ] generates segments of available data as Interest arrives, to minimize delivery latency.
* [ ] responds to version discovery Interests with CanBePrefix.
* [ ] responds to RDR protocol.
* [ ] generates manifest.
* [X] supports segment numbers.
* [ ] supports byte offsets.
* [X] supports multiple naming conventions.
* [X] signs packets with fixed key.
* [ ] signs packets with trust schema.
* [ ] reports when all segments have been retrieved at least once.
