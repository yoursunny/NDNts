# @ndn/psync

This package is part of [NDNts](https://yoursunny.com/p/NDNts/), Named Data Networking libraries for the modern web.

This package contains **PSync** and related protocols, including:

* [PSync - FullSync](https://github.com/named-data/PSync)
  * complete unit test
* [PSync - PartialSync](https://github.com/named-data/PSync)
  * simple unit test
  * application nack handling is incomplete
* [syncps - Pubsub](https://github.com/pollere/DNMP-v2/tree/main/syncps)
  * simple unit test
  * implementation is compatible with DNMP-v2 syncps, not DCT syncps

These implementations are parameterized.
Certain algorithm settings (e.g. hashtable size) and encoding details (e.g. endianness) are extracted from the core logic and put into `Parameters` structures.
Each protocol has at least a set of *compat* parameters that is consistent with the reference implementation, validated in [sync-interop](../../integ/sync-interop/README.md).
In the future, there would be alternative parameter sets optimized for the modern web (e.g. smaller code bundle size), but incompatible with the reference implementation.

NOTICE:
PSync commit d83af5255db9c4a557264542647f7ccb281e6840 (2024-04-09) introduces breaking changes to the FullSync algorithm and codec.
This library has been adjusted to support the changed encoding, but does not yet implement the improved algorithm.
