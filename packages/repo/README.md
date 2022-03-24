# @ndn/repo

This package is part of [NDNts](https://yoursunny.com/p/NDNts/), Named Data Networking libraries for the modern web.

This package implements a Data repository.
The repo is primarily designed to be embedded into Node and web applications, rather than running as a standalone daemon process.
Data ingestion is mainly supported through APIs, not command packets.
Data retrieval is on par with other repo implementations.

```ts
import { DataStore, RepoProducer, PrefixRegShorter } from "@ndn/repo";

// other imports for examples
import { Name, Interest, Data } from "@ndn/packet";
import memdown from "memdown";
import { strict as assert } from "node:assert";
import { setTimeout as delay } from "node:timers/promises";
```

## DataStore

**DataStore** is a Data packet storage, based on [LevelDB](https://www.npmjs.com/package/leveldown) or other [abstract-leveldown](https://www.npmjs.com/package/abstract-leveldown) compatible key-value store.
It implements most of `DataStore` interfaces defined in `@ndn/repo-api` package, offering APIs to insert and delete Data packets.

```ts
// DataStore constructor accepts an abstract-leveldown instance.
// For in-memory storage, use 'memdown'.
// For persistent storage, use 'leveldown' in Node.js or 'level-js' in browsers.
const store = new DataStore(memdown());

// Insert Data packets.
await store.insert(new Data("/A/0"));
// You can totally insert multiple Data packets in one command.
// This is even preferred, because it bundles them into one LevelDB transaction and runs faster.
await store.insert(new Data("/A/1"), new Data("/A/2"));
// You can also pass the result of fetch() function from @ndn/segmented-object package directly to
// insert() function, because it accepts AsyncIterable<Data> and Iterable<Data> types.

// You can set an expiration time during insertion. Packets disappear upon expiration.
await store.insert({ expireTime: Date.now() + 50 }, new Data("/A/3"));
await delay(50); // Poof, it's gone.
// Inserting new Data packet with same name would overwrite previous packet, even if their implicit
// digests differ. You cannot store two packets with same name.

// Delete Data packets.
await store.delete(new Name("/A/0"), new Name("/A/4"));
// It's harmless to delete non-existent packets, such as /A/4 above.

// Now let's retrieve them.
const rA1 = await store.find(new Interest("/A/1"));
assert.equal(`${rA1?.name}`, "/8=A/8=1");
// Prefix name is supported too.
const rA = await store.find(new Interest("/A", Interest.CanBePrefix));
assert(["/8=A/8=1", "/8=A/8=2"].includes(`${rA?.name}`));
// /A/3 has disappeared because it is expired.
const rA3 = await store.find(new Interest("/A/3"));
assert.equal(rA3, undefined);
```

## RepoProducer

**RepoProducer** makes packets in a DataStore available for retrieval.

```ts
// Construct a RepoProducer.
// The 'reg' option controls what name prefixes should be registered.
// PrefixRegStatic(new Name("/A"), new Name("/B")) registers a fixed set of prefixes.
// PrefixRegShorter(1) registers prefixes that are 1-component shorter than each Data name.
// See test cases for more options.
// These registrations stay with NDNts forwarding plane. Typically you'll want a package such as
// @ndn/nfdmgmt to propagate them to the uplink(s).
const p = RepoProducer.create(store, { reg: PrefixRegShorter(1) });

// Close the RepoProducer and the DataStore.
p.close();
await store.close();
```
