# @ndn/cli-common

This package is part of [NDNts](https://yoursunny.com/p/NDNts/), Named Data Networking libraries for the modern web.

This package implements common routines for NDNts based CLI programs.
In particular, it initializes KeyChain and uplink faces.
These can be configured via environment variables.

## KeyChain Setup

`NDNTS_KEYCHAIN` environment variable specifies the KeyChain locator, which is a filesystem path where KeyChain files are stored.
If empty, a temporary in-memory KeyChain will be used.
`openKeyChain` function returns this KeyChain.

`NDNTS_KEY` environment variable specifies the default signing key.
It may be a certificate name, a key name, or prefix of a subject name.
If empty, any key in the KeyChain may be used.
If the specified prefix does not match any existing key, digest signing will be used.
`getSigner` function returns the private key.

## Forwarder Setup

`NDNTS_PKTTRACE=1` environment variable enables forwarder tracing.

`NDNTS_UPLINK` environment variable creates an uplink to another forwarder/node.
It supports Unix (e.g. `unix:///run/nfd.sock`), TCP (e.g. `tcp://192.0.2.1:6363`), UDP (e.g. `udp://192.0.2.1:6363`), and autoconfig (i.e. `autoconfig:` or `autoconfig-tcp:`).
The default is `unix:///run/nfd.sock`.
`openUplinks` function creates the uplink, and `closeUplinks` function closes the uplink.

`NDNTS_MTU` environment variable sets the MTU for fragmentation of outgoing packets.
It must be a positive integer, and the default value is 1450.
It applies to UDP uplinks only.

`NDNTS_NFDREG=1` environment variable enables prefix registration on the uplink using NFD management protocol.
If this is set, prefix registration feature will be enabled by `openUplinks` function.

`NDNTS_NFDREGKEY` environment variable specifies the signing key for prefix registration commands.
The default is using the same key as `NDNTS_KEY`.
