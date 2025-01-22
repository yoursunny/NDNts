# `@ndn/psync` and `@ndn/svs` Interoperability Test

## PSync

Test environment:

* Ubuntu 22.04
* ndn-cxx 0.9.0-16-gd384a530
* NFD 24.07-11-ga745025b
* Node.js v22.13.0

Reference implementation:

* PSync 0.5.0-1-gf4571e8d

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

* Ubuntu 22.04
* ndn-cxx 0.9.0-16-gd384a530
* NFD 24.07-11-ga745025b
* Node.js v22.13.0
* Go 1.23.4

Reference implementation:

* [StateVectorSync C++ library](https://github.com/named-data/ndn-svs) commit `7fa0af007772c2e320bdc3996fd3bb57fbb21347` (2025-01-05)
* [NDNd](https://github.com/named-data/ndnd) commit `814d19d06446eeb84cecbe24ee4469ea7fca3a4c` (2025-01-14)

Build reference program:

```bash
# in ndn-svs directory
./waf configure --with-examples
./waf

# in $HOME directory
go install -v github.com/named-data/ndnd/std/examples/low-level/svs@v1.4.3-0.20250113180516-814d19d06446
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
# NDNd: in $HOME directory
~/go/bin/svs /ndnd-svs3

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
