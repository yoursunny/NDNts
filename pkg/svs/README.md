# @ndn/svs

This package is part of [NDNts](https://yoursunny.com/p/NDNts/), Named Data Networking libraries for the modern web.

This package contains **StateVectorSync** and related protocols, including:

* [StateVectorSync v2](https://named-data.github.io/StateVectorSync/Specification.html), revision 2025-01-04
  * complete unit test
  * core synchronization logic only, does not deal with Data fetching
  * note: SVS v1 has been deleted
* [SVS-PS](https://named-data.github.io/StateVectorSync/PubSubSpec.html), revision 2023-05-19
  * simple unit test
  * piggyback MappingData feature is not supported

Compatibility with the reference implementation is validated in [sync-interop](../../integ/sync-interop).
