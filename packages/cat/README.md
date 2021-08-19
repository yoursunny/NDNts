# @ndn/cat

This package is part of [NDNts](https://yoursunny.com/p/NDNts/), Named Data Networking libraries for the modern web.

**ndncat** is a command line utility to publish and retrieve objects in various formats.

## Publish and Retrieve Segmented Object

`ndncat put-segmented` publishes a segmented object, reading payload from standard input.
It accepts the following arguments:

* Positional argument: name prefix.
* `NDNTS_UPLINK`, `NDNTS_NFDREG`, `NDNTS_KEYCHAIN`, `NDNTS_KEY` environment variables, as explained in `@ndn/cli-common` package.
* `--convention1` selects 2014 Naming Convention instead of 2019 Naming Convention for version and segment components.
* `--ver=42` inserts a specific version number as version component.
* `--ver=now` (default) inserts current timestamp as version component.
* `--ver=none` omits version component.
* `--no-rdr` disables publishing current version as a RDR metadata packet. This is ignored with `--ver=none`.
* `--file=FILE` reads from a file instead of standard input.
* `--chunk-size=N` sets segment payload size.

`ndncat get-segmented` retrieves a segmented object, writing payload to standard output.
It accepts the following arguments:

* Positional argument: name prefix.
* `NDNTS_UPLINK` environment variable, as explained in `@ndn/cli-common` package.
* `--convention1` selects 2014 Naming Convention instead of 2019 Naming Convention for version and segment components.
* `--ver=none` disables version discovery and assumes either Data has no version component or the input name has version component.
* `--ver=cbp` sends Interest with CanBePrefix and MustBeFresh to discover version.
* `--ver=rdr` (default) sends an RDR discovery Interest to discover version.

### Example

```bash
dd if=/dev/urandom of=/tmp/1.bin bs=1M count=1

# producer: serve from stdin
ndncat put-segmented /A </tmp/1.bin

# producer: serve from file, 8KB chunks
ndncat put-segmented /A --file=/tmp/1.bin --chunk-size=8192

# consumer: perform version discovery via RDR protocol
ndncat get-segmented /A >/tmp/2.bin

# consumer: perform version discovery via CanBePrefix
ndncat get-segmented --ver=cbp /A >/tmp/2.bin

# producer: use 2014 convention; retrieve with ndncatchunks
ndncat put-segmented --convention1 /A </tmp/1.bin
ndncatchunks /A >/tmp/2.bin

# consumer: use 2014 convention; retrieve from ndnputchunks
ndnputchunks /A </tmp/1.bin
ndncat get-segmented --convention1 --ver=rdr /A >/tmp/2.bin

diff /tmp/1.bin /tmp/2.bin
rm /tmp/1.bin /tmp/2.bin
```

## Download Files and Folders

`ndncat file-client` downloads files and folders served from [ndn6-file-server](https://github.com/yoursunny/ndn6-tools/blob/main/file-server.md).
It accepts the following arguments:

* Positional arguments: remote name prefix, local file directory.
* `NDNTS_UPLINK` environment variable, as explained in `@ndn/cli-common` package.
* `--jobs=4` sets number of parallel downloads.
* `--retx=10` sets Interest retransmission limit.

### Example

```bash
ndn6-file-server /demo/file-server /usr/include/linux

ndncat file-client /demo/file-server /tmp/file-client-demo
```
