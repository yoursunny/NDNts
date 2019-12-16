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

`ndncat get-segmented` retrieves a segmented object, writing payload to standard output.
It accepts the following arguments:

* Positional argument: name prefix.
* `NDNTS_UPLINK` environment variable, as explained in `@ndn/cli-common` package.
* `--convention1` selects 2014 Naming Convention instead of 2019 Naming Convention for version and segment components.
* `--ver=none` (default) disables version discovery and assumes either Data has no version component or the input name already contains version component.
* `--ver=cbp` sends Interest with CanBePrefix and MustBeFresh to discover version.

### Example

```sh
dd if=/dev/urandom of=/tmp/1.bin bs=1M count=1
NDNTS_NFDREG=1 ndncat put-segmented /A
ndncat get-segmented --ver=cbp /A > /tmp/2.bin
diff /tmp/1.bin /tmp/2.bin
rm /tmp/1.bin /tmp/2.bin
```
