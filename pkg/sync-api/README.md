# @ndn/sync-api

This package is part of [NDNts](https://yoursunny.com/p/NDNts/), Named Data Networking libraries for the modern web.

This package defines the abstract programming interfaces of dataset synchronization and publish-subscribe protocols.
Each sync/pubsub protocol package shall re-export relevant interfaces in type-only mode.
Users do not need to import from this package directly.

This package also includes functions common to multiple sync/pubsub protocol implementations.
These are implementation details of sync/pubsub protocols.
