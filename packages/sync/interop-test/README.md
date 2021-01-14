# `@ndn/sync` Interoperability Test

Test environment:

* Node.js 14.15.4
* ndn-cxx and NFD 0.7.1 (install from PPA)
* [PSync C++ library](https://github.com/named-data/PSync) commit `32b97d7654f5a3851388804ec3a0cbc2fde2c06f` (2020-12-31)
* [ndn-ind](https://github.com/operantnetworks/ndn-ind) commit `dd934a7a5106cda6ea14675554427e12df1ce18f` (2020-12-23)
* syncps in [DNMP-v2](https://github.com/pollere/DNMP-v2) commit `c9431460f85c326a410758aa4ff2a26bfcf0df69` (2020-10-17)

## PSyncFull

```bash
# in NDNts directory
NDNTS_NFDREG=1 npm run literate packages/sync/interop-test/psync-full.ts

# in PSync directory
export NDN_LOG=examples.FullSyncApp=INFO
LD_LIBRARY_PATH=build ./build/examples/psync-full-sync /psync-interop /psync-memphis/${RANDOM} 10 1000
```

## PSyncPartialPublisher

```bash
# in NDNts directory
NDNTS_NFDREG=1 npm run literate packages/sync/interop-test/psync-partial-publisher.ts

# in PSync directory
export NDN_LOG=examples.PartialSyncConsumerApp=INFO
LD_LIBRARY_PATH=build ./build/examples/psync-consumer /psync-interop 5
```

## PSyncPartialSubscriber

```bash
# in PSync directory
export NDN_LOG=examples.PartialSyncProducerApp=INFO
LD_LIBRARY_PATH=build ./build/examples/psync-producer /psync-interop /psync-memphis/${RANDOM} 10 1000

# in NDNts directory
npm run literate packages/sync/interop-test/psync-partial-subscriber.ts
```

## SyncpsPubsub

```bash
# these dependencies must be installed before compiling ndn-ind
sudo apt install build-essential clang-8 liblog4cxx-dev libprotobuf-dev libssl-dev protobuf-compiler

# in ndn-ind directory
./configure
make -j$(nproc)
sudo make install
sudo ldconfig

# in NDNts directory

# build C++ interop test program
DNMPV2=$HOME/code/DNMP-v2
make -C ${DNMPV2} syncps/syncps-content.pb.cc
g++ -o packages/sync/interop-test/syncps-ind.exe \
  -std=c++17 $(pkg-config --cflags libndn-ind) -I${DNMPV2}/syncps \
  packages/sync/interop-test/syncps-ind.cpp ${DNMPV2}/syncps/syncps-content.pb.cc \
  $(pkg-config --libs libndn-ind) -lboost_iostreams -lboost_chrono -lboost_system \
  -lprotobuf -llog4cxx -lpthread

# start NDNts interop test script
NDNTS_NFDREG=1 npm run literate packages/sync/interop-test/syncps.ts

# start C++ interop test program
packages/sync/interop-test/syncps-ind.exe /syncps-interop /syncps-interop-data /syncps-interop-data/ind/$RANDOM >/dev/null
```
