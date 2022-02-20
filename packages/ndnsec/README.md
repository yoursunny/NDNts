# @ndn/ndnsec

This package is part of [NDNts](https://yoursunny.com/p/NDNts/), Named Data Networking libraries for the modern web.

`SafeBag` type allows importing and exporting private keys in ndn-cxx [SafeBag](https://named-data.net/doc/ndn-cxx/0.8.0/specs/safe-bag.html) format.
SafeBag encodes the private key as `EncryptedPrivateKeyInfo` ASN.1 structure, which may use one of many encryption algorithms.
The implementation for browsers only supports *PBES2(PBKDF2(HMAC-SHA256),AES-256-CBC)* encryption algorithm, which appears to be the default in OpenSSL 1.1.1.

`NdnsecKeyChain` type can access keys and certificates in ndn-cxx KeyChain.
It works by invoking the `ndnsec` executable.
This feature only works in Node.js.
