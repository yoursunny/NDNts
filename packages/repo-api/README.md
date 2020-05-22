# @ndn/repo-api

This package is part of [NDNts](https://yoursunny.com/p/NDNts/), Named Data Networking libraries for the modern web.

This package defines the programming interface of an abstract Data repository, and functions that work with this interface.

## DataStore

**DataStore** is an abstract interface of a Data repository.
`DataStore` type of `@ndn/repo` package is an implementation of this interface.

### Loopup and Enumeration Methods

**get(name)** retrieves Data by exact name.

**find(interest)** finds Data that satisfies Interest.

**listNames(prefix?)** iterates over names of stored Data.

**listData(prefix?)** iterates over stored Data.

### Modifier Methods

**insert(...pkts)** inserts Data packets.

**erase(...names)** deletes Data packets.

## Bulk Insert

A repo may accept Data ingestion via [bulk insertion protocol](https://redmine.named-data.net/projects/repo-ng/wiki/Tcp_Bulk_Insert_Repo_Insertion_Protocol).
The Data producer initiates a reliable connection to the repo's bulk insertion target, and then writes Data packets over this connection.
The repo then saves received Data to storage, but provides no feedback.
Conventionally, this protocol runs over TCP and uses port 7376.

This package implements core functionality of this protocol.

* Data producer can use **BulkInsertInitiator** type to initiate bulk insertion.
* Repo can use **BulkInsertTarget** type to accept bulk insertion.

They are used in `@ndn/repo-cli` package.
