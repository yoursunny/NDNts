# `@ndn/nac` Interoperability Test

Test environment:

* Node.js 18.9.0
* ndn-cxx 0.8.0-40-g87208f96
* [name-based-access-control C++ library](https://github.com/named-data/name-based-access-control) commit `2f0a401c247078319d648973fefadb89f6b9e6e6` (2022-09-12)
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
