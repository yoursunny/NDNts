# `@ndn/psync` and `@ndn/svs` Interoperability Test

## PSync

Test environment:

* Ubuntu 22.04
* ndn-cxx 0.8.1-55-gc5003938
* NFD 22.12-41-g91c15c8c
* Node.js 20.11.0

Reference implementation:

* PSync 0.4.0-15-gac63e32

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

* Ubuntu 22.04
* ndn-cxx 0.8.1-51-g16203ea2
* NFD 22.12-37-g4c95771b
* Node.js 20.10.0
* Docker 24.0.7

Reference implementation:

* [ndn-ind](https://github.com/operantnetworks/ndn-ind) commit `8bc5d60b40afa2f03e11ecb591a852dff8a66422` (2021-09-19)
* syncps in [DNMP-v2](https://github.com/pollere/DNMP-v2) commit `d42092e40a88b676c2181615d13b3b0bbaea5699` (2021-01-15)

Build reference program as Docker container:

```bash
# in NDNts directory
cd integ/sync-interop
docker build -t localhost/ndnts-sync-interop-syncps -f Dockerfile.syncps .
```

Test `SyncpsPubsub`:

```bash
# with NFD running
docker run -it --rm \
  --mount type=bind,src=/run/nfd/nfd.sock,target=/var/run/nfd.sock \
  localhost/ndnts-sync-interop-syncps \
  /sync-interop/syncps-ind.exe /syncps-interop /syncps-interop-data /syncps-interop-data/ind/$RANDOM

# in NDNts directory
corepack pnpm literate integ/sync-interop/syncps.ts
```

## StateVectorSync

Test environment:

* Ubuntu 22.04
* ndn-cxx 0.8.1-38-g5686c51b
* NFD 22.12-18-g910232fc
* Node.js 20.5.1

Reference implementation:

* [StateVectorSync C++ library](https://github.com/named-data/ndn-svs) commit `81ab1a16765533e3844d9aac11dabc47a737170b` (2023-08-23)

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
