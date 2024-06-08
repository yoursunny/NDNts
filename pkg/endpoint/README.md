# @ndn/endpoint

This package is part of [NDNts](https://yoursunny.com/p/NDNts/), Named Data Networking libraries for the modern web.

This package implements the *endpoint* concept, consisting of `consume` and `produce` functions.
These are the basic abstractions through which an application can communicate with the NDN network.

The endpoint concept is similar to a "client face" in other NDN libraries, with the enhancement that it handles these details automatically:

* [X] Outgoing packets are signed and incoming packets are verified, if trust schema is provided.
* [X] Outgoing Interests are retransmitted periodically, if retransmission policy is specified.
* [X] Outgoing Data buffer, if enabled, allows the producer to reply to one Interest with multiple Data (e.g. segments), or push generated Data without receiving an Interest.
      Data will be sent automatically upon Interest arrival.
* [X] The underlying transport is reconnected upon failure, if transport failure policy is specified (implemented in `@ndn/l3face` package).
* [X] Prefix registrations are refreshed periodically or upon transport reconnection (implemented in `@ndn/nfdmgmt` package).

```ts
import { consume, produce } from "@ndn/endpoint";

// other imports for examples
import { generateSigningKey } from "@ndn/keychain";
import { Data, digestSigning } from "@ndn/packet";
import { fromUtf8, toUtf8 } from "@ndn/util";

// Generate a key pair for the demo.
const [signer, verifier] = await generateSigningKey("/identity");
```

## Producer

The `produce()` standalone function creates a producer.
It accepts three parameters:

1. A name prefix that the producer should listen on.
2. A handler function that produces the Data in reply to an Interest.
3. Additional options.

```ts
using producer = produce("/P", async (interest) => {
  console.log(`Producer is handling Interest ${interest.name}`);
  return new Data(interest.name, toUtf8("served by NDNts"));
}, {
  concurrency: 16, // allow concurrent calls to the handler function
  dataSigner: signer, // enable automatic signing
});
```

The return value of `produce()` function is an object that implements **Producer** interface.
This interface contains accessors and methods for observing and controlling the producer.

The object implements [Disposable](https://github.com/tc39/proposal-explicit-resource-management) interface.
With `using` keyword (TypeScript only), the producer is closed when the variable goes out of scope.
Alternatively, you can invoke `producer[Symbol.dispose]()` explicitly.

## Consumer

The `consume()` standalone function creates a consumer to receive a single Data packet.
It accepts two parameters:

1. An Interest or Interest name.
2. Additional options.

```ts
const consumer1 = consume("/P/1", {
  retx: 2, // enable retransmission
  verifier, // enable automatic verification
});
try {
  const data1 = await consumer1;
  console.log(`Consumer receives Data ${data1.name} with content "${
    fromUtf8(data1.content)}" after ${consumer1.nRetx} retransmissions`);
} catch (err: unknown) {
  console.log("Consumer error", err);
}
```

The return value of `consume()` function is an object that implements **ConsumerContext** interface.
This interface contains accessors and methods for observing and controlling the consumer.

Most importantly, the return value is a Promise that resolves to the retrieved Data or rejects upon error (including timeout).
Thus, you can simply `await consume(..)` to obtain the Data.

```ts
try {
  const data2 = await consume("/P/2", { retx: 2, verifier });
  console.log(`Consumer receives Data ${data2.name}`);
} catch (err: unknown) {
  console.log("Consumer error", err);
}
```
