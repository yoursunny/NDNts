# `@ndn/nac` Interoperability Test

Test environment:

* Ubuntu 22.04
* ndn-cxx 0.9.0-16-gd384a530
* NFD 24.07-14-g2b43d675
* Node.js 22.13.0

Reference implementation:

* [name-based-access-control C++ library](https://github.com/named-data/name-based-access-control) commit `3c835dcda0e5463a788dc6fd43fa00d10a88db4f` (2024-12-13)
* `./waf configure --with-examples`

## NDNts Producer and C++ Consumer

```bash
rm -rf $HOME/.ndn
ndnsec key-gen -tr /member

# in NDNts directory
corepack pnpm literate integ/nac-interop/producer.ts
# wait for 'ready' message

# in name-based-access-control directory
LD_LIBRARY_PATH=build NDN_LOG="nac.*=DEBUG" build/examples/nac-consumer
```

## NDNts Consumer and C++ Producer

```bash
rm -rf $HOME/.ndn
ndnsec key-gen -tr /member

# in name-based-access-control directory
LD_LIBRARY_PATH=build NDN_LOG="nac.*=DEBUG" build/examples/nac-producer

# in NDNts directory
corepack pnpm literate integ/nac-interop/consumer.ts
```
