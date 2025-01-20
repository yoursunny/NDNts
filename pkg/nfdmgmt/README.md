# @ndn/nfdmgmt

This package is part of [NDNts](https://yoursunny.com/p/NDNts/), Named Data Networking libraries for the modern web.

This package implements basic support for [NFD Management protocol](https://redmine.named-data.net/projects/nfd/wiki/Management).
It includes both a generic variant and a NFD-specific variant with additional typing.

* [X] ControlCommand
  * [X] generic: `invokeGeneric`, `ControlResponse`
  * [X] NFD: `invoke`, `invokeCsErase`, `ControlParameters`
* [X] StatusDataset
  * [X] generic: `list`, `StatusDataset`
  * [X] NFD: `FaceDataset`, `FaceQuery`, `CsInfo`, `StrategyChoice`, `RibEntry`
* [ ] NotificationStream
* [X] Prefix Announcement object

This implementation is validated against NFD using [nfdmgmt-interop](../../integ/nfdmgmt-interop).

```ts
import { PrefixAnn, enableNfdPrefixReg } from "@ndn/nfdmgmt";

// other imports for examples
import { consume, produce } from "@ndn/endpoint";
import { Forwarder, type FwFace } from "@ndn/fw";
import { generateSigningKey, Certificate } from "@ndn/keychain";
import { UnixTransport } from "@ndn/node-transport";
import { Interest, Data } from "@ndn/packet";
import { Closers, delay, fromUtf8, toUtf8 } from "@ndn/util";
import assert from "node:assert/strict";

using closers = new Closers();
```

## Prefix Announcement Object

`PrefixAnn` type represents a Prefix Announcement object as defined in [Prefix Announcement Protocol](https://redmine.named-data.net/projects/nfd/wiki/PrefixAnnouncement).

```ts
// Generate a signing key pair and certificate.
const [privateKey, publicKey] = await generateSigningKey("/K");
const cert = await Certificate.selfSign({ privateKey, publicKey });
const signer = privateKey.withKeyLocator(cert.name);

// Build a Prefix Announcement object.
const pa = await PrefixAnn.build({
  announced: "/Q",
  expirationPeriod: 1200_000,
  signer,
});

// Access the Prefix Announcement as Data packet.
const paData = pa.data;
console.log(paData.name.toString());

// Parse Prefix Announcement from Data packet.
const paParsed = PrefixAnn.fromData(paData);
console.log(paParsed.announced.toString());
```

## NFD Prefix Registration

`enableNfdPrefixReg` function enables NFD prefix registration.
The snippet here shows API usage.
If you are using `@ndn/cli-common` package, this is called automatically if the uplink connects to NFD.

```ts
// Create two forwarders, one as consumer and one as producer.
const fwC = Forwarder.create();
const fwP = Forwarder.create();

// Connect to NFD using Unix socket transport.
const unixSocket = process.env.DEMO_NFD_UNIX ?? "/run/nfd/nfd.sock";
let uplinkC: FwFace;
let uplinkP: FwFace;
try {
  uplinkC = await UnixTransport.createFace({ fw: fwC }, unixSocket);
  uplinkP = await UnixTransport.createFace({ fw: fwP, addRoutes: [] }, unixSocket);
} catch {
  // Skip the example if NFD is not running.
  console.warn("NFD not running");
  process.exit(0);
}
closers.push(uplinkC, uplinkP);

// Enable NFD prefix registration.
enableNfdPrefixReg(uplinkP, {
  PrefixAnn, // opt-in Prefix Announcement protocol by providing the PrefixAnn constructor
  signer: privateKey,
});

// Start two producers.
const producerP = produce("/P", async (interest) => {
  console.log(`producing ${interest.name}`);
  return new Data(interest.name, Data.FreshnessPeriod(1000), toUtf8("NDNts + NFD - P"));
}, {
  fw: fwP,
  // no Prefix Announcement object - will register prefix with NFD rib/register command
});
const producerQ = produce("/Q", async (interest) => {
  console.log(`producing ${interest.name}`);
  return new Data(interest.name, Data.FreshnessPeriod(1000), toUtf8("NDNts + NFD - Q"));
}, {
  fw: fwP,
  // supplied the Prefix Announcement object - will register prefix with NFD rib/announce command
  announcement: pa,
});
closers.push(producerP, producerQ);
await delay(500);

// Start two consumers, fetch Data from the producers through NFD.
await Promise.all(Array.from(["P", "Q"], async (prefix) => {
  const data = await consume(new Interest(`/${prefix}/${Math.random()}`, Interest.MustBeFresh), { fw: fwC });
  const payloadText = fromUtf8(data.content);
  console.log("received", `${data.name} ${payloadText}`);
  assert.equal(payloadText, `NDNts + NFD - ${prefix}`);
}));
```
