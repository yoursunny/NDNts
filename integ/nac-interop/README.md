# `@ndn/nac` Interoperability Test

Test environment:

* Ubuntu 22.04
* ndn-cxx 0.8.1-55-gc5003938
* [name-based-access-control C++ library](https://github.com/named-data/name-based-access-control) commit `af4e4e735873a37a5bf1b7dbe9eed5014283900b` (2024-01-26)
  * `./waf configure --with-examples`
* Node.js 20.11.0

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
