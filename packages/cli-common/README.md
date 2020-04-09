# @ndn/cli-common

This package is part of [NDNts](https://yoursunny.com/p/NDNts/), Named Data Networking libraries for the modern web.

This package implements common routines for NDNts based CLI programs.
In particular, it initializes KeyChain and uplink faces.
These can be configured via environment variables.

## KeyChain Setup

`NDNTS_KEYCHAIN` environment variable specifies the KeyChain locator, which is a filesystem path where KeyChain files are stored.
If empty, a temporary in-memory KeyChain will be used.
`openKeyChain` function returns this KeyChain.

`NDNTS_KEY` environment variable specifies (a prefix of) the default signing key.
If empty, any key in the KeyChain may be used.
If the specified prefix does not match any existing key, the DigestKey will be used.
`getSigner` function returns the private key.

## Forwarder Setup

`NDNTS_PKTTRACE=1` environment variable enables forwarder tracing.

`NDNTS_UPLINK` environment variable creates an uplink to another forwarder/node.
It supports Unix (e.g. `unix:///run/nfd.sock`), TCP (e.g. `tcp://192.0.2.1:6363`), UDP (e.g. `udp://192.0.2.1:6363`), and autoconfig (i.e. `autoconfig:`).
The default is `unix:///run/nfd.sock`.
`openUplinks` function creates the uplink, and `closeUplinks` function closes the uplink.

`NDNTS_NFDREG=1` environment variable enables prefix registration on the uplink using NFD management protocol.
If this is set, prefix registration feature will be enabled by `openUplinks` function.

`NDNTS_NFDREGKEY` environment variable specifies (a prefix of) the signing key for prefix registration commands.
The default is using the same key as `NDNTS_KEY`.
