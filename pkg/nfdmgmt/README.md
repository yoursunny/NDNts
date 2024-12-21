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

This implementation is validated against NFD using [nfdmgmt-interop](../../integ/nfdmgmt-interop).

```ts
import { enableNfdPrefixReg } from "@ndn/nfdmgmt";

// other imports for examples
import { consume, produce } from "@ndn/endpoint";
import { Forwarder, type FwFace } from "@ndn/fw";
import { generateSigningKey } from "@ndn/keychain";
import { UnixTransport } from "@ndn/node-transport";
import { Data, Interest, Name } from "@ndn/packet";
import { delay, fromUtf8, toUtf8 } from "@ndn/util";
import assert from "node:assert/strict";
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
try {
  uplinkC = await UnixTransport.createFace({ fw: fwC }, unixSocket);
} catch {
  // Skip the example if NFD is not running.
  console.warn("NFD not running");
  process.exit(0);
}
const uplinkP = await UnixTransport.createFace({ fw: fwP, addRoutes: [] }, unixSocket);

// Generate a signing key and enable NFD prefix registration.
const [privateKey] = await generateSigningKey("/K");
enableNfdPrefixReg(uplinkP, { signer: privateKey });

// Start a producer.
const producer = produce("/P", async () => {
  console.log("producing");
  return new Data("/P", Data.FreshnessPeriod(1000), toUtf8("NDNts + NFD"));
}, { fw: fwP });
await delay(500);

// Start a consumer, fetch Data from the producer via NFD.
const data = await consume(new Interest("/P", Interest.MustBeFresh), { fw: fwC });
const payloadText = fromUtf8(data.content);
console.log("received", `${data.name} ${payloadText}`);
assert.equal(payloadText, "NDNts + NFD");

// Close faces.
uplinkC.close();
uplinkP.close();
producer.close();
```
