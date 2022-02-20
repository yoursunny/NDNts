# @ndn/keychain

This package is part of [NDNts](https://yoursunny.com/p/NDNts/), Named Data Networking libraries for the modern web.

This package provides signing algorithms, encryption algorithms, and certificate management features.

The implementation uses [Web Crypto API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Crypto_API).

* Modern browsers and Node.js 16.x natively support WebCrypto.
* Most browsers restrict WebCrypto to [secure contexts](https://www.w3.org/TR/powerful-features/) only.
  During development, you may use `http://localhost` or [ngrok](https://ngrok.com/).

## Signing Algorithms

This package implements signature types defined in [NDN Packet Format 0.3](https://named-data.net/doc/NDN-packet-spec/0.3/signature.html):

* [X] DigestSha256 (in `@ndn/packet` package)
  * [X] signing and verification
* [X] SignatureSha256WithRsa (RSASSA-PKCS1-v1\_5)
  * [X] signing and verification
  * [X] KeyLocator .Name
  * [ ] KeyLocator .KeyDigest
* [X] SignatureSha256WithEcdsa
  * [X] signing and verification
  * [X] KeyLocator .Name
  * [ ] KeyLocator .KeyDigest
* [X] SignatureHmacWithSha256
  * [X] signing and verification
  * [ ] KeyLocator matching

Both Interest and Data are signable.

* [X] sign Interest
  * [X] put certificate name in KeyLocator
  * [X] generate SigNonce, SigTime, SigSeqNum
* [X] verify Interest
  * [X] check ParametersSha256DigestComponent
  * [X] check SigNonce, SigTime, SigSeqNum
* [X] sign Data
  * [X] put certificate name in KeyLocator
* [X] verify Data

## Encryption Algorithms

* [X] AES-CBC
  * [X] low-level encryption and decryption
* [X] AES-CTR and AES-GCM
  * [X] low-level encryption and decryption
  * [X] generate unique IV
  * [X] check IV uniqueness
* [X] RSA-OAEP
  * [X] low-level encryption and decryption

## Algorithm List (algoList)

Several functions accept an `algoList` argument that contains the crypto algorithms it can recognize.
Typically, the default value of this argument is `SigningAlgorithmListSlim`, `EncryptionAlgorithmListSlim`, or `CryptoAlgorithmListSlim`.
These *slim* lists include only ECDSA algorithm, which is the most commonly used in NDN applications.

If you need to use other algorithms or communicate with applications that use other algorithms, you should pass `SigningAlgorithmListFull`, `EncryptionAlgorithmListFull`, or `CryptoAlgorithmListFull` to these functions.
These *full* lists include all algorithms implemented in NDNts.

If you know which algorithms are needed, you can import individual algorithms and an array of desired algorithms.

This design is a trade-off for reducing browser bundle size.

## Certificate Management and Storage

`Certificate` class provides basic operations with [NDN Certificate Format 2.0](https://named-data.net/doc/ndn-cxx/0.8.0/specs/certificate.html).

* [X] generate self-signed certificate
* [X] issue certificate to another public key
* [X] import certificate as `PublicKey` for RSASSA-PKCS1-v1\_5 and ECDSA

`KeyChain` class provides storage of `PrivateKey` and `Certificate`.
It could be ephemeral or persistent.
`KeyChain.createTemp()` creates an in-memory ephemeral keychain.
`KeyChain.open(locator)` opens a persistent keychain.

Persistent keychain in Node.js uses JSON files as underlying storage.
The *locator* argument should be a filesystem directory where these files are stored.
Private keys are saved as [JSON Web Key (JWK)](https://tools.ietf.org/html/rfc7517) format, so that it's important to protect the storage directory.
It is unsafe to simultaneously construct multiple `KeyChain` instances on the same storage directory or access the same keychain from multiple Node.js processes.

Persistent keychain in browser uses [IndexedDB API](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API).
The *locator* argument determines the database name(s).
Private keys are saved as non-extractable `CryptoKey` objects.

## Known Issues

* In Firefox, persistent keychain stores JWK instead of `CryptoKey`, due to [Mozilla Bug 1545813](https://bugzilla.mozilla.org/show_bug.cgi?id=1545813).
* In Firefox, persistent keychain is unusable in a Private Browsing window, due to [Mozilla Bug 781982](https://bugzilla.mozilla.org/show_bug.cgi?id=1639542).
* In Chrome, AES 192-bit key is not supported.
* In iOS and macOS Safari, ECDSA P-521 curve is not supported.
