# `@ndn/nac` Interoperability Test

Test environment:

* Node.js 14.4
* ndn-cxx 0.7.0 (install from PPA)
* [name-based-access-control reference implementation](https://github.com/named-data/name-based-access-control) commit `1b9be6c1914bdc0bc6b935d93276117433299570` (2020-06-01)

## NDNts Producer and C++ Consumer

```bash
rm -rf $HOME/.ndn
ndnsec key-gen -tr /member

# in NDNts directory
npm run literate packages/nac/interop-test/producer.ts
# wait for 'ready' message

# in name-based-access-control directory
LD_LIBRARY_PATH=build NDN_LOG="nac.*=DEBUG" build/examples/consumer
```

## NDNts Consumer and C++ Producer

```bash
rm -rf $HOME/.ndn
ndnsec key-gen -tr /member

# in name-based-access-control directory
LD_LIBRARY_PATH=build NDN_LOG="nac.*=DEBUG" build/examples/producer

# in NDNts directory
npm run literate packages/nac/interop-test/consumer.ts
```
