# @ndn/repo

This package is part of [NDNts](https://yoursunny.com/p/NDNts/), Named Data Networking libraries for the modern web.

This package implements a Data repository.
The repo is primarily designed to be embedded into Node and web applications, rather than running as a standalone daemon process.
Data ingestion is mainly supported through APIs, not command packets.
Data retrieval is on par with other repo implementations.

```ts
import { makeInMemoryDataStore, RepoProducer, PrefixRegShorter } from "@ndn/repo";

// other imports for examples
import { Endpoint } from "@ndn/endpoint";
import { Name, Interest, Data } from "@ndn/packet";
import { delay } from "@ndn/util";
import assert from "node:assert/strict";
```

## DataStore

**DataStore** is a Data packet storage, based on an [abstract-level](https://www.npmjs.com/package/abstract-level) compatible key-value database.
It implements most of `DataStore` interfaces defined in `@ndn/repo-api` package, offering APIs to insert and delete Data packets.

`DataStore.create()` function creates a **DataStore** instance, but it's more convenient to use a helper function:

* `makeInMemoryDataStore()` creates an in-memory DataStore, backed by [memory-level](https://www.npmjs.com/package/memory-level).
* `makePersistentDataStore(location)` creates a persistent DataStore, backed by [level](https://www.npmjs.com/package/level).
  * `location` is a directory path (relative or absolute) in Node.js, or a IDB database name in browser.

The **DataStore** type implements [AsyncDisposable](https://github.com/tc39/proposal-explicit-resource-management) interface.
With `await using` keyword (TypeScript only), the DataStore is closed when the variable goes out of scope.
Alternatively, you can invoke `await store[Symbol.asyncDispose]()` explicitly.

```ts
await using store = await makeInMemoryDataStore();
```

The **DataStore** type supports Data insertion, Data deletion, and Data lookup.
During insertion, you can set an expiration time upon which the packet disappears.

```ts
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

`RepoProducer.create()` function creates a **RepoProducer** instance, serving Data from an existing **DataStore** instance.

The `reg` option passed to this function controls what name prefixes should be registered:

* `PrefixRegStatic(new Name("/A"), new Name("/B"))` registers a fixed set of prefixes.
* `PrefixRegShorter(1)` registers prefixes that are 1-component shorter than each Data name.
* See [test cases](tests/producer.t.ts) for more options.

These registrations are effectively within NDNts logical forwarder.
Typically you'll combine them with a prefix readvertise module such as `@ndn/nfdmgmt` to propagate the prefix registration to remote forwarders.

The **RepoProducer** type implements [Disposable](https://github.com/tc39/proposal-explicit-resource-management) interface.
With `using` keyword (TypeScript only), the producer is closed when the variable goes out of scope.
Alternatively, you can invoke `repoProducer[Symbol.dispose]()` explicitly.

```ts
// Construct a RepoProducer.
using repoProducer = RepoProducer.create(store, { reg: PrefixRegShorter(1) });
await delay(10); // prefix registration is asynchronous so we delay a little bit

// Try to retrieve Data.
const endpoint = new Endpoint();
const retrieved = await endpoint.consume("/A/2");
assert.equal(`${retrieved?.name}`, "/8=A/8=2");
```
