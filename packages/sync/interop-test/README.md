# `@ndn/sync` Interoperability Test

Test environment:

* Node.js 14.15.3
* ndn-cxx and NFD 0.7.1 (install from PPA)
* [PSync C++ library](https://github.com/named-data/PSync) commit `b60398c5fc216a1b577b9dbcf61d48a21cb409a4` (2020-12-18)

## PSyncFull

```bash
# in NDNts directory
NDNTS_NFDREG=1 npm run literate packages/sync/interop-test/psync-full.ts

# in PSync directory
export NDN_LOG=examples.FullSyncApp=INFO
LD_LIBRARY_PATH=build ./build/examples/psync-full-sync /psync-interop /psync-memphis/${RANDOM} 10 1000
```
