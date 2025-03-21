# @ndn/ndndsec

This package is part of [NDNts](https://yoursunny.com/p/NDNts/), Named Data Networking libraries for the modern web.

This package implements basic support for [NDNd keychain](https://github.com/named-data/ndnd/blob/main/docs/security-util.md).

`parseKey` function loads unencrypted private key file generated by `ndnsec sec keygen` command.

`parseCert` function loads certificate file generated by `ndnsec sec sign-cert` command.

`UnencryptedPrivateKey` type, returned by `parseKey`, allows importing the key pair into NDNts keychain.
This only works in Node.js, because Web Crypto API does not support PKCS#1 or SEC1 private key formats.
