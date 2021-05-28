# @ndn/autoconfig

This package is part of [NDNts](https://yoursunny.com/p/NDNts/), Named Data Networking libraries for the modern web.

This package establishes connection to a NDN network using [NDN-FCH service](https://github.com/11th-ndn-hackathon/ndn-fch).

```ts
import { fchQuery, connectToNetwork } from "@ndn/autoconfig";

// other imports for examples
import { Endpoint } from "@ndn/endpoint";
import { Forwarder } from "@ndn/fw";
import { strict as assert } from "assert";
(async () => {
if (process.env.CI) { return; }
```

## Query NDN-FCH Service

`fchQuery` function sends a query to NDN-FCH service.

```ts
// The simplest query:
let res = await fchQuery();
assert.equal(res.udp.length, 1);
console.log("closest router", res);

// Ask for multiple routers:
res = await fchQuery({ count: 4 });
assert(res.udp.length > 1);
console.log("multiple routers", res);

// Ask for router at specific location:
res = await fchQuery({ position: [121.40335, 31.00799] });
console.log("near @yoursunny's birthplace", res);
```

## Connect to Network

```ts
const fw = Forwarder.create();

// Connect to NDN network via routers in FCH response, consider default IPv4 gateway as a candidate.
// Also provide a fallback list in case the above candidates fail.
// Keep only the fastest face and close others.
const faces = await connectToNetwork({
  fw,
  fallback: ["suns.cs.ucla.edu", "ndn.qub.ac.uk"],
  connectTimeout: 3000,
});
assert.equal(faces.length, 1);
const [fastestFace] = faces;
console.log("fastest face is", `${fastestFace}`);

// By default, default route "/" is added to the face, so that you can send Interests right away.
try {
  const t0 = Date.now();
  const data = await new Endpoint({ fw }).consume(`/ndn/edu/ucla/ping/${Math.floor(Math.random() * 1e9)}`);
  console.log("Interest satisfied", `${Date.now() - t0}ms`);
} catch (err: unknown) {
  console.warn(err);
}

fastestFace.close();
```

```ts
})();
```
