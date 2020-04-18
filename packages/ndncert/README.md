# @ndn/ndncert

This package is part of [NDNts](https://yoursunny.com/p/NDNts/), Named Data Networking libraries for the modern web.

## NDNCERT 0.2

This package implements basic support for [NDN Certificate Management protocol v0.2](https://github.com/named-data/ndncert/wiki/NDNCERT-Protocol-0.2).
Currently, it includes a client, tuned for the [quirks](https://www.lists.cs.ucla.edu/pipermail/nfd-dev/2019-November/003918.html) in [ndncert CA](https://github.com/named-data/ndncert/tree/aae119aeb9b5387f2fd8f80c56ee8cbfe8c15988).
Use `@ndn/ndncert/02` import path to access this implementation.

This implementation works in Node and Chrome (desktop and Android).
It does not work in Firefox and iOS, because Web Crypto API does not support ECDH *compressed point* format.

`@ndn/keychain-cli` package offers `ndntssec ndncert02-client` command that uses this implementation.

## NDNCERT 0.3

[NDN Certificate Management protocol v0.3](https://github.com/named-data/ndncert/wiki/NDNCERT-Protocol-0.3) implementation is in progress.

* [X] crypto operations
* [ ] messages
  * [X] CA profile (segmentation not supported)
  * [ ] PROBE request
  * [ ] PROBE response
  * [X] NEW request
  * [X] NEW response
  * [X] CHALLENGE request
  * [X] CHALLENGE response
  * [X] error messages
* [ ] server
  * [X] publish CA profile with RDR
  * [ ] probe
  * [X] basic issuance workflow
  * [ ] challenges
  * [X] publish certificate
  * [ ] proper error messages
* [ ] client workflow
  * [ ] probe
  * [X] basic issuance workflow
  * [ ] challenges
  * [X] retrieve certificate
  * [ ] handle error messages

`@ndn/keychain-cli` package offers `ndntssec ndncert03-profile`,  `ndntssec ndncert03-ca`,  `ndntssec ndncert03-client` commands that use this implementation.
