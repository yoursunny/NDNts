# @ndn/ndncert

This package is part of [NDNts](https://yoursunny.com/p/NDNts/), Named Data Networking libraries for the modern web.

This package partially implements [NDN Certificate Management protocol v0.3](https://github.com/named-data/ndncert/wiki/NDNCERT-Protocol-0.3/46700d99c67dc94d13d26f838e4594f1f66d7c76) and [challenges](https://github.com/named-data/ndncert/wiki/NDNCERT-Protocol-0.3-Challenges/46700d99c67dc94d13d26f838e4594f1f66d7c76).

* [X] crypto operations
* [X] messages
  * [X] CA profile (segmentation not supported)
  * [ ] PROBE request
  * [ ] PROBE response
  * [X] NEW request
  * [X] NEW response
  * [X] CHALLENGE request
  * [X] CHALLENGE response
  * [X] error messages
* [X] server
  * [X] publish CA profile with RDR
  * [ ] probe
  * [X] basic issuance workflow
  * [X] PIN challenge
  * [ ] email challenge
  * [X] proof of possession challenge
  * [X] publish certificate
  * [ ] proper error messages
* [X] client
  * [ ] probe
  * [X] basic issuance workflow
  * [X] PIN challenge
  * [ ] email challenge
  * [X] proof of possession challenge
  * [X] retrieve certificate
  * [X] handle error messages

`@ndn/keychain-cli` package offers `ndntssec ndncert03-profile`,  `ndntssec ndncert03-ca`,  `ndntssec ndncert03-client` commands that use this implementation.
