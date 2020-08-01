# @ndn/nfdmgmt

This package is part of [NDNts](https://yoursunny.com/p/NDNts/), Named Data Networking libraries for the modern web.

This package implements basic support for [NFD Management protocol](https://redmine.named-data.net/projects/nfd/wiki/Management).
In particular, it enables prefix registration on NFD.

```ts
import { enableNfdPrefixReg, signInterest02 } from "@ndn/nfdmgmt";

// other imports for examples
import { Endpoint } from "@ndn/endpoint";
import { Forwarder, FwFace } from "@ndn/fw";
import { generateSigningKey } from "@ndn/keychain";
import { UnixTransport } from "@ndn/node-transport";
import { Data, Interest, Name } from "@ndn/packet";
import { fromUtf8, toUtf8 } from "@ndn/tlv";
import { strict as assert } from "assert";
(async () => {
```

## 2014 Signed Interest

While `@ndn/keychain` package only supports 2019 Signed Interest format, NFD Management protocol is using [2014 Signed Interest format](https://named-data.net/doc/ndn-cxx/0.6.6/specs/signed-interest.html).
`signInterest02` function provides basic support for that format.

```ts
// Generate a signing key.
const [privateKey] = await generateSigningKey("/K");

// Prepare the Interest.
const interest = new Interest("/I");
await signInterest02(interest, { signer: privateKey });
assert.equal(interest.name.length, 5);
console.log(`${interest.name}`);
```

## NFD Prefix Registration

```ts
// Create two forwarders, one as consumer and one as producer.
const fwC = Forwarder.create();
const fwP = Forwarder.create();

// Connect to NFD using Unix socket transport.
let uplinkC: FwFace;
try {
  uplinkC = await UnixTransport.createFace({ fw: fwC }, "/run/nfd.sock");
} catch {
  // Skip the example if NFD is not running.
  console.warn("NFD not running");
  return;
}
uplinkC.addRoute(new Name("/"));
const uplinkP = await UnixTransport.createFace({ fw: fwP }, "/run/nfd.sock");

// Enable NFD prefix registration.
enableNfdPrefixReg(uplinkP, { signer: privateKey });

// Start a producer.
const producer = new Endpoint({ fw: fwP }).produce("/P",
  async () => {
    console.log("producing");
    return new Data("/P", Data.FreshnessPeriod(1000), toUtf8("NDNts + NFD"));
  });
await new Promise((r) => setTimeout(r, 500));

// Start a consumer, fetching Data from the producer via NFD.
const data = await new Endpoint({ fw: fwC }).consume(
  new Interest("/P", Interest.MustBeFresh),
);
const payloadText = fromUtf8(data.content);
console.log("received", `${data.name} ${payloadText}`);
assert.equal(payloadText, "NDNts + NFD");

// Close faces.
uplinkC.close();
uplinkP.close();
producer.close();
```

```ts
})();
```
