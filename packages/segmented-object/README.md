# @ndn/endpoint

This package is part of [NDNts](https://yoursunny.com/p/NDNts/), Named Data Networking libraries for the modern web.

This package implements functions to publish and retrieve segmented objects.

The `publish` function is not yet implemented.

The `fetch` function:

* [ ] supports version discovery.
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
