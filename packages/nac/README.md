# @ndn/nac

This package is part of [NDNts](https://yoursunny.com/p/NDNts/), Named Data Networking libraries for the modern web.

This package implements [NAC-RSA](https://github.com/named-data/name-based-access-control) named based access control protocol.
It works in Node.js environment only, due to limitation of `SafeBag` implementation from the `@ndn/ndnsec` package.

This implementation is validated against the reference implementation using [interop-test](interop-test/).
