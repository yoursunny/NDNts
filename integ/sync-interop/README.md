# `@ndn/psync` and `@ndn/svs` Interoperability Test

## PSync

Test environment:

* Ubuntu 26.04
* ndn-cxx 0.9.0-39-g093f5006
* NFD 24.07-34-g146968d3
* Node.js 26.5.0

Reference implementation:

* PSync 0.5.0-10-gcfe73af7

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

Test `FullSync`:

```bash
# in NDNts directory
corepack pnpm literate integ/sync-interop/psync-full.ts

# in PSync directory
export NDN_LOG=examples.FullSyncApp=INFO
LD_LIBRARY_PATH=build ./build/examples/psync-full-sync /psync-interop /psync-memphis/${RANDOM} 10 1000
```

Test `PartialPublisher`:

```bash
# in NDNts directory
corepack pnpm literate integ/sync-interop/psync-partial-publisher.ts

# in PSync directory
export NDN_LOG=examples.PartialSyncConsumerApp=INFO
LD_LIBRARY_PATH=build ./build/examples/psync-consumer /psync-interop 5
```

Test `PartialSubscriber`:

```bash
# in PSync directory
export NDN_LOG=examples.PartialSyncProducerApp=INFO
LD_LIBRARY_PATH=build ./build/examples/psync-producer /psync-interop /psync-memphis/${RANDOM} 10 1000

# in NDNts directory
corepack pnpm literate integ/sync-interop/psync-partial-subscriber.ts
```

## StateVectorSync

Test environment:

* Ubuntu 26.04
* ndn-cxx 0.9.0-39-g093f5006
* NFD 24.07-34-g146968d3
* Node.js 26.5.0
* Go 1.26.4

Reference implementation:

* [StateVectorSync C++ library](https://github.com/named-data/ndn-svs) commit `a93724758aca71a4ea327574ef7af46770a81a40` (2026-06-01)
* [NDNd](https://github.com/named-data/ndnd) commit `c45174db7d18dc5b9b5d632d1439e8a5c945fca2` (2026-07-11)

Build reference program:

```bash
# in ndn-svs directory
./waf configure --with-examples
./waf
```

The sync group prefix shall use multicast strategy:

```bash
# start NFD
sudo systemctl restart nfd

# set multicast strategy
nfdc strategy set /ndn/svs /localhost/nfd/strategy/multicast
```

Test `SvSync` (SVS v2):

```bash
# C++: in ndn-svs directory
LD_LIBRARY_PATH=build ./build/examples/core /cpp-${RANDOM}

# in NDNts directory
corepack pnpm literate integ/sync-interop/svsync.ts /NDNts-${RANDOM}
```

Test `SvSync` (SVS v3):

```bash
# NDNd: in ndnd directory
go run ./std/examples/svs/pure-sync /ndnd-svs3

# in NDNts directory
corepack pnpm literate integ/sync-interop/svsync.ts --svs3 /NDNts-svs3
```

Test `SvPublisher`:

```bash
# in NDNts directory
corepack pnpm literate integ/sync-interop/svsps-publisher.ts /NDNts-${RANDOM}

# C++: in ndn-svs directory
LD_LIBRARY_PATH=build ./build/examples/chat-pubsub /cpp-${RANDOM}
```

Test `SvSubscriber`:

```bash
# C++: in ndn-svs directory
LD_LIBRARY_PATH=build ./build/examples/chat-pubsub /cpp-${RANDOM}

# in NDNts directory
corepack pnpm literate integ/sync-interop/svsps-subscriber.ts
```

What to do and what to observe:

* For C++ `chat-pubsub` publisher: type a line on the console and press ENTER to publish an update.
* NDNts and NDNd publisher do not need user interaction.
* Look at console logs: when one peer publishes an update, the other peer should see the update.
