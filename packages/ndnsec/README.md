# @ndn/ndnsec

This package is part of [NDNts](https://yoursunny.com/p/NDNts/), Named Data Networking libraries for the modern web.

`NdnsecKeyChain` type can access keys and certificates in ndn-cxx KeyChain.
It works by invoking the `ndnsec` executable.
This feature only works in Node.js.

`SafeBag` type allows importing and exporting private keys in ndn-cxx [SafeBag](https://named-data.net/doc/ndn-cxx/0.7.1/specs/safe-bag.html) format.
In Node.js, both importing and exporting are supported.
In browsers, importing works, but exporting is not yet implemented.
