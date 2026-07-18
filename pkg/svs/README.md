# @ndn/svs

This package is part of [NDNts](https://yoursunny.com/p/NDNts/), Named Data Networking libraries for the modern web.

This package contains **StateVectorSync** and related protocols, including:

* [StateVectorSync v2](https://github.com/named-data/StateVectorSync/blob/98bb56661b98a1afa869a96d86715b9788e671a6/Specification.md), revision 2025-01-04
  * deprecated, enable with `svs3: false` option
  * partial unit test
  * core synchronization logic only, does not deal with Data fetching
* [StateVectorSync v3](https://named-data.github.io/StateVectorSync/Specification.html), revision 2025-01-14
  * complete unit test
  * core synchronization logic only, does not deal with Data fetching
* [SVS-PS](https://named-data.github.io/StateVectorSync/PubSubSpec.html), revision 2025-01-04
  * simple unit test
  * piggyback MappingData feature is not supported

Compatibility with the reference implementation is validated in [sync-interop](../../integ/sync-interop).
