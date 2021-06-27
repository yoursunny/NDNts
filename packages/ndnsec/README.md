# @ndn/ndnsec

This package is part of [NDNts](https://yoursunny.com/p/NDNts/), Named Data Networking libraries for the modern web.

This package provides `NdnsecKeyChain` to access keys and certificates in ndn-cxx KeyChain via `ndnsec` executable.

This package can deal with [SafeBag](https://named-data.net/doc/ndn-cxx/0.7.1/specs/safe-bag.html) format, which contains certificate and private key exported by ndn-cxx `ndnsec` tool.
This feature does not require `ndnsec` to be installed.
Since SafeBag contains encrypted PKCS#8 data that is not supported by WebCrypto, this feature is only available in Node.js environment, and cannot work in browsers.
