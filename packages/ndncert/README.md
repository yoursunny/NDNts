# @ndn/ndncert

This package is part of [NDNts](https://yoursunny.com/p/NDNts/), Named Data Networking libraries for the modern web.

This package implements basic support for [NDN Certificate Management protocol](https://github.com/named-data/ndncert/wiki/NDNCERT-Protocol-0.2).
Currently, it includes a client, tuned for the [quirks](https://www.lists.cs.ucla.edu/pipermail/nfd-dev/2019-November/003918.html) in [ndncert CA](https://github.com/named-data/ndncert/tree/aae119aeb9b5387f2fd8f80c56ee8cbfe8c15988).

This implementation works in Node and Chrome (desktop and Android).
It does not work in Firefox and iOS, because Web Crypto API does not support ECDH *compressed point* format.
