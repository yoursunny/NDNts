# `@ndn/nac` Interoperability Test

Test environment:

* Ubuntu 26.04
* ndn-cxx 0.9.0-39-g093f5006
* NFD 24.07-34-g146968d3
* Node.js 26.5.0

Reference implementation:

* [name-based-access-control C++ library](https://github.com/named-data/name-based-access-control) commit `40829f34f1ef02369086e881c1e1e4c8988b479c` (2026-01-24)
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
