# `@ndn/nac` Interoperability Test

Test environment:

* Node.js 16.13.0
* ndn-cxx 0.7.1 (install from PPA)
* [name-based-access-control C++ library](https://github.com/named-data/name-based-access-control) commit `d4689c8f805c2c0ba38fab3e44519c55316c1ac9` (2021-10-07)
  * `./waf configure --with-examples`

## NDNts Producer and C++ Consumer

```bash
rm -rf $HOME/.ndn
ndnsec key-gen -tr /member

# in NDNts directory
npm run literate packages/nac/interop-test/producer.ts
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
npm run literate packages/nac/interop-test/consumer.ts
```
