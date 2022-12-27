# `@ndn/sync` Interoperability Test

## PSync

Test environment:

* Ubuntu 20.04
* Node.js 19.0.0

Reference implementation:

* ndn-cxx 0.8.0-49-g8fbffe45
* NFD 0.8.0-49-g8fbffe45
* libpsync 0.3.0-20-g03426ef

Build reference program:

```bash
# in PSync directory, build library and examples
./waf configure --with-examples
./waf

# in PSync directory, build examples only
mkdir -p build/examples
for F in examples/*.cpp; do
  g++ --std=c++17 -o build/examples/psync-$(basename -s .cpp $F) $F $(pkg-config --cflags --libs libndn-cxx PSync)
done
```

Test `PSyncFull`:

```bash
# in NDNts directory
corepack pnpm literate integ/sync-interop/psync-full.ts

# in PSync directory
export NDN_LOG=examples.FullSyncApp=INFO
LD_LIBRARY_PATH=build ./build/examples/psync-full-sync /psync-interop /psync-memphis/${RANDOM} 10 1000
```

Test `PSyncPartialPublisher`:

```bash
# in NDNts directory
corepack pnpm literate integ/sync-interop/psync-partial-publisher.ts

# in PSync directory
export NDN_LOG=examples.PartialSyncConsumerApp=INFO
LD_LIBRARY_PATH=build ./build/examples/psync-consumer /psync-interop 5
```

Test `PSyncPartialSubscriber`:

```bash
# in PSync directory
export NDN_LOG=examples.PartialSyncProducerApp=INFO
LD_LIBRARY_PATH=build ./build/examples/psync-producer /psync-interop /psync-memphis/${RANDOM} 10 1000

# in NDNts directory
corepack pnpm literate integ/sync-interop/psync-partial-subscriber.ts
```

## syncps

Test environment:

* Ubuntu 20.04
* Node.js 16.13.1

Reference implementation:

* [ndn-ind](https://github.com/operantnetworks/ndn-ind) commit `8bc5d60b40afa2f03e11ecb591a852dff8a66422` (2021-09-19)
* syncps in [DNMP-v2](https://github.com/pollere/DNMP-v2) commit `d42092e40a88b676c2181615d13b3b0bbaea5699` (2021-01-15)

Build reference program:

```bash
# install dependencies before building ndn-ind
sudo apt install --no-install-recommends build-essential libboost-chrono-dev libboost-filesystem-dev libboost-iostreams-dev libboost-system-dev liblog4cxx-dev libprotobuf-dev libsqlite3-dev libssl-dev pkg-config protobuf-compiler

# in ndn-ind directory
./configure
make -j$(nproc)
sudo make install
sudo ldconfig

# in DNMP-v2 directory
DNMPV2=$(pwd)
make syncps/syncps-content.pb.cc

# in NDNts directory
g++ -o integ/sync-interop/syncps-ind.exe \
  -std=c++17 $(pkg-config --cflags libndn-ind) -I${DNMPV2}/syncps \
  integ/sync-interop/syncps-ind.cpp ${DNMPV2}/syncps/syncps-content.pb.cc \
  $(pkg-config --libs libndn-ind) -lboost_iostreams -lboost_system -lprotobuf -llog4cxx -lpthread
```

Test `SyncpsPubsub`:

```bash
# in NDNts directory
integ/sync-interop/syncps-ind.exe /syncps-interop /syncps-interop-data /syncps-interop-data/ind/$RANDOM >/dev/null

# in NDNts directory
corepack pnpm literate integ/sync-interop/syncps.ts
```

## SvSync

Test environment:

* Ubuntu 20.04
* Node.js 19.3.0

Reference implementation:

* ndn-cxx 0.8.0-59-g15fa994b
* NFD 0.8.0-59-g15fa994b
* [StateVectorSync C++ library](https://github.com/named-data/ndn-svs) commit `e39538ed1ddd789de9a34c242af47c3ba4f3583d` (2022-12-08)

Build reference program:

```bash
# in ndn-svs directory
./waf configure --with-examples
./waf
```

Test `SvSync`:

```bash
# in ndn-svs directory
LD_LIBRARY_PATH=build ./build/examples/chat /${RANDOM}

# in NDNts directory
corepack pnpm literate integ/sync-interop/svsync.ts
```

Test `SvPublisher`:

```bash
# in NDNts directory
corepack pnpm literate integ/sync-interop/svsps-publisher.ts

# in ndn-svs directory
LD_LIBRARY_PATH=build ./build/examples/chat-pubsub /${RANDOM}
```

Test `SvSubscriber`:

```bash
# in ndn-svs directory
LD_LIBRARY_PATH=build ./build/examples/chat-pubsub /${RANDOM}

# in NDNts directory
corepack pnpm literate integ/sync-interop/svsps-subscriber.ts
```
