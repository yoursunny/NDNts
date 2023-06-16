# @ndn/autoconfig

This package is part of [NDNts](https://yoursunny.com/p/NDNts/), Named Data Networking libraries for the modern web.

This package establishes connection to a NDN network using [NDN-FCH service](https://github.com/11th-ndn-hackathon/ndn-fch).

```ts
import { fchQuery, connectToNetwork } from "@ndn/autoconfig";

// other imports for examples
import { Endpoint } from "@ndn/endpoint";
import { Forwarder } from "@ndn/fw";
import assert from "node:assert/strict";

if (process.env.CI) { process.exit(0); }
```

## Query NDN-FCH Service

`fchQuery` function sends a query to NDN-FCH service.

```ts
// The simplest query:
let res = await fchQuery();
showFchResponse("closest router", res);
assert.equal(res.routers.length, 1);

// Ask for multiple routers:
res = await fchQuery({ count: 4 });
showFchResponse("multiple routers", res);
assert(res.routers.length > 1);

// Ask for multiple transports:
res = await fchQuery({ transports: { udp: 4, wss: 2 } });
showFchResponse("multiple transports", res);
assert(res.routers.length > 1);

// Limit to particular network:
//   "ndn" = global NDN testbed
//   "yoursunny" = yoursunny ndn6 network
res = await fchQuery({ transport: "wss", count: 3, network: "yoursunny" });
showFchResponse("yoursunny ndn6 network", res);
assert(res.routers.length > 1);

// Ask for router at specific location:
res = await fchQuery({ position: [121.40335, 31.00799] });
showFchResponse("near @yoursunny's birthplace", res);
assert.equal(res.routers.length, 1);

function showFchResponse(title, res) {
  console.log(title, `updated ${res.updated}`);
  console.table(res.routers.map((r) => ({
    transport: r.transport,
    connect: r.connect,
    prefix: r.prefix && `${r.prefix}`,
  })));
}
```

## Connect to Network

```ts
const fw = Forwarder.create();

// Connect to NDN network via routers in FCH response, consider default IPv4 gateway as a candidate.
// Also provide a fallback list in case the above candidates fail.
// Keep only the fastest face and close others.
const faces = await connectToNetwork({
  fw,
  fallback: ["suns.cs.ucla.edu", "vnetlab.gcom.di.uminho.pt"],
  connectTimeout: 3000,
});
assert.equal(faces.length, 1);
const [fastestFace] = faces;
console.log("fastest face is", `${fastestFace}`);

// By default, default route "/" is added to the face, so that you can send Interests right away.
try {
  const t0 = Date.now();
  const data = await new Endpoint({ fw }).consume(`/ndn/edu/ucla/ping/${Math.trunc(Math.random() * 1e8)}`);
  console.log("Interest satisfied", `${data.name}`, `${Date.now() - t0}ms`);
} catch (err: unknown) {
  console.warn(err);
}

fastestFace.close();
```
