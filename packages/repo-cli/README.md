# @ndn/repo-cli

This package is part of [NDNts](https://yoursunny.com/p/NDNts/), Named Data Networking libraries for the modern web.

**ndnts-repo** is a command line utility to run and benchmark `@ndn/repo` and other repo implementations.

## `ndnts-repo server`: Repo Server

```bash
# with NFD running, start the repo server
ndnts-repo server --store=/tmp/repo --rdr=true
```

## `ndnts-repo fillbi`: Fill Repo with Demo Data

```bash
# with repo server running, fill Data via bulk insertion
ndnts-repo fillbi --prefix=/repodemo --start=0 --count=32768

# retrieve one Data packet
ndnpeek /repodemo/seq=$RANDOM | ndn-dissect
```
