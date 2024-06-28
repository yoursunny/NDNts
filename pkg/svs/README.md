# @ndn/svs

This package is part of [NDNts](https://yoursunny.com/p/NDNts/), Named Data Networking libraries for the modern web.

This package contains **StateVectorSync** and related protocols, including:

* [StateVectorSync](https://named-data.github.io/StateVectorSync/Specification.html), revision 2021-12-15
  * complete unit test
  * core synchronization logic only, does not deal with Data fetching
* [SVS-PS](https://named-data.github.io/StateVectorSync/PubSubSpec.html), revision 2023-05-19
  * simple unit test

Compatibility with the reference implementation is validated in [sync-interop](../../integ/sync-interop/README.md).

[SVS v2](https://github.com/named-data/StateVectorSync/pull/14) is being implemented:

* [X] Encode StateVector in ApplicationParameters instead of Name.
      Enable with `svs2interest: true` option.
* [X] Use exponential decay function for suppression timeout.
      Enable with `svs2suppression: true` option.
* [X] Don't enter suppression state if every node was updated in last suppression period.
      Enable with `svs2suppression: true` option.
* [ ] Piggyback SVS-PS MappingData.
* [ ] Accept piggybacked SVS-PS MappingData.
