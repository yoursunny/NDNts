# @ndn/cli-common

This package is part of [NDNts](https://yoursunny.com/p/NDNts/), Named Data Networking libraries for the modern web.

This package implements common routines for NDNts based CLI programs.
In particular, it initializes KeyChain and uplink faces.
These can be configured via environment variables.
Moreover, environment variables in **.env** file will be loaded automatically.

## KeyChain Configuration

`NDNTS_KEYCHAIN` environment variable specifies the KeyChain locator, which is a filesystem path where KeyChain files are stored.
If empty, a temporary in-memory KeyChain will be used.

`NDNTS_KEY` environment variable specifies the default signing key.
It's recommended to use a certificate name, but this can also be a key name or prefix of a subject name.
If empty, any key in the KeyChain may be used.
If the specified prefix does not match any existing key, digest signing will be used.

## Logical Forwarder and Uplink Configuration

`NDNTS_PKTTRACE=1` environment variable enables logical forwarder tracing.

`NDNTS_UPLINK` environment variable creates an uplink to another forwarder/node.
It supports:

* connect to NFD (or similar) via Unix socket, e.g. `unix:///run/nfd.sock`
* connect to NFD via TCP, e.g. `tcp://192.0.2.1:6363`
* connect to NFD via UDP unicast, e.g. `udp://192.0.2.1:6363`
* connect to NDN-DPDK via UDP: `ndndpdk:` or `ndndpdk-udp:`
* connect to NDN-DPDK via memif: `ndndpdk-memif:`
* perform NDN-FCH query and connect to global NDN network: `autoconfig:` (prefer UDP) or `autoconfig-tcp:` (prefer TCP)

The default is:

* Linux: `unix:///run/nfd.sock`
* Windows: `tcp://127.0.0.1:6363`
* other platforms: `unix:///var/run/nfd.sock`

`NDNTS_MTU` environment variable sets the MTU for fragmentation of outgoing packets, applicable to UDP and memif.
It must be a positive integer, and the default value is 1400.
It's recommended to increase this value when using memif.

`NDNTS_NFDREG=0` environment variable disables prefix registration on the uplink using NFD management protocol.
The default is enabling NFD prefix registration if the uplink is possibly connected to NFD.

`NDNTS_NFDREGKEY` environment variable specifies the signing key for prefix registration commands.
This accepts the same syntax as `NDNTS_KEY`.
The default is using the same key as `NDNTS_KEY`.

`NDNTS_NDNDPDK_GQLSERVER` environment variable specifies the NDN-DPDK GraphQL server endpoint.
The default is `http://127.0.0.1:3030`.
This is only used when `NDNTS_UPLINK` specifies an uplink in NDN-DPDK.

`NDNTS_NDNDPDK_LOCAL` environment variable specifies a local IP address that is reachable from NDN-DPDK.
The default is auto-detected from GraphQL HTTP client.

`NDNTS_NDNDPDK_MEMIF_SOCKETPATH` environment variable specifies a directory for memif control socket.
The default is `/run/ndn`.

## API

`exitClosers` array allows scheduling objects to be closed at exit.
`exitHandler` function is registered as SIGINT handle that is triggered upon pressing CTRL+C, which closes the objects in `exitClosers`.
You may disable this handler with `process.off("SIGINT", exitHandler)`.

`openKeyChain` function returns the specified KeyChain.
`getSigner` function returns a signer using the default signing key.

`openUplinks` function creates the uplink.
It also enables prefix registration unless explicitly disabled.

`closeUplinks` function closes the uplink.
Uplinks are also automatically closed at exit via `exitClosers`.
