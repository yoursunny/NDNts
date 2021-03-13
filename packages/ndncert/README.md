# @ndn/ndncert

This package is part of [NDNts](https://yoursunny.com/p/NDNts/), Named Data Networking libraries for the modern web.

This package partially implements [NDN Certificate Management protocol v0.3](https://github.com/named-data/ndncert/wiki/NDNCERT-Protocol-0.3/2f5e2f9f0079a675dcad87e0d74be4ee3f027739) and [challenges](https://github.com/named-data/ndncert/wiki/NDNCERT-Protocol-0.3-Challenges/46700d99c67dc94d13d26f838e4594f1f66d7c76).

Features:

* [X] CA profile (segmentation not supported)
* [ ] PROBE command
* [X] certificate issuance: NEW and CHALLENGE commands
* [ ] certificate renewal
* [ ] certificate revocation
* [X] CA publishes issued certificates to `@ndn/repo`

Challenges:

* [X] PIN
* [X] email, with name assignment policy
* [X] proof of possession, with name assignment policy
* [X] "nop" (not in NDNCERT spec)

`@ndn/keychain-cli` package offers `ndnts-keychain ndncert03-profile`,  `ndnts-keychain ndncert03-ca`,  `ndnts-keychain ndncert03-client` commands that use this implementation.
