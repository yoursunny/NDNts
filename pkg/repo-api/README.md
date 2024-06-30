# @ndn/repo-api

This package is part of [NDNts](https://yoursunny.com/p/NDNts/), Named Data Networking libraries for the modern web.

This package defines the programming interface of an abstract Data repository, and functions that work with this interface.

## DataStore

**DataStore** is a group of interfaces that defines the API of a Data repository.

* `get(name)` retrieves Data by exact name.
* `find(interest)` finds Data that satisfies Interest.
* `listNames(prefix?)` iterates over names of stored Data.
* `listData(prefix?)` iterates over stored Data.
* `insert(options?, ...pkts)` inserts Data packets.
* `delete(...names)` deletes Data packets.

**DataArray** from this package is a minimal but inefficient implementation of these interfaces.
`DataStore` type from `@ndn/repo` package is a full implementation with much larger code size.

## DataTape

**DataTape** is a file or stream that consists of a sequence of Data packets.
As a file type, DataTape may be used to transfer packets between repo instances.

`DataTape` type of this package is an append-only implementation of `DataStore` interface.
The `copy(src, prefix?, dst, options?)` function can import or export packets between `DataStore` and `DataTape` instances.

## Bulk Insert

A repo may accept Data ingestion via [bulk insertion protocol](https://redmine.named-data.net/projects/repo-ng/wiki/Tcp_Bulk_Insert_Repo_Insertion_Protocol).
The Data producer initiates a reliable connection to the repo's bulk insertion target and writes Data packets over this connection.
The repo then saves received Data to storage, but provides no feedback.
Conventionally, this protocol runs over TCP and uses port 7376.

This package implements core functionality of this protocol.

* Data producer can use **BulkInsertInitiator** type to initiate bulk insertion.
* Repo can use **BulkInsertTarget** type to accept bulk insertion.

They are used in `@ndn/repo-cli` package.
