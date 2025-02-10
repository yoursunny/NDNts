# @ndn/keychain

This package is part of [NDNts](https://yoursunny.com/p/NDNts/), Named Data Networking libraries for the modern web.

This package provides signing algorithms, encryption algorithms, and certificate management features.

The implementation uses [Web Crypto API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Crypto_API) that is natively supported in Node.js and modern browsers.
Most browsers restrict WebCrypto to [secure contexts](https://developer.mozilla.org/en-US/docs/Web/Security/Secure_Contexts) only, so that this implementation will not work on a webpage that is not delivered securely.
During development, you may use `http://localhost` or [ngrok](https://ngrok.com/) to serve the webpage from a secure context.

## Signing Algorithms

This package implements signature types defined in [NDN Packet Format 0.3](https://docs.named-data.net/NDN-packet-spec/0.3/signature.html):

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
* [X] SignatureEd25519
  * [X] signing and verification
  * [X] KeyLocator .Name
  * [ ] KeyLocator .KeyDigest

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

If you know which algorithms are needed, you can import individual algorithms and pass an array of desired algorithms.

This design is a trade-off for reducing browser bundle size.

## Certificate Management and Storage

`Certificate` class provides basic operations with [NDN Certificate Format](https://docs.named-data.net/NDN-packet-spec/0.3/certificate.html).

* [X] generate self-signed certificate
* [X] issue certificate to another public key
* [X] import certificate as `PublicKey` for RSASSA-PKCS1-v1\_5, ECDSA, Ed25519

`KeyChain` class provides storage of `PrivateKey` and `Certificate`.
It could be ephemeral or persistent.
`KeyChain.createTemp()` creates an in-memory ephemeral keychain.
`KeyChain.open(locator)` opens a persistent keychain.

Persistent keychain in Node.js uses JSON files as underlying storage.
The *locator* argument should be a filesystem directory where these files are stored.
Private keys are saved as [JSON Web Key (JWK)](https://datatracker.ietf.org/doc/html/rfc7517) format, so that it's important to protect the storage directory.
It is unsafe to simultaneously construct multiple `KeyChain` instances on the same storage directory or access the same keychain from multiple Node.js processes.

Persistent keychain in browser uses [IndexedDB API](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API).
The *locator* argument determines the database name(s).
Private keys are saved as non-extractable `CryptoKey` objects.

## Known Issues

* In Chrome, AES 192-bit key is not supported.
* Ed25519 in browser is implemented in JavaScript, which is less secure than native Web Crypto implementation.
