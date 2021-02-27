# @ndn/autoconfig

This package is part of [NDNts](https://yoursunny.com/p/NDNts/), Named Data Networking libraries for the modern web.

This package enables connection to global NDN testbed using [NDN-FCH service](https://github.com/named-data/ndn-fch/).

```ts
import { queryFch, connectToTestbed } from "@ndn/autoconfig";

// other imports for examples
import { Endpoint } from "@ndn/endpoint";
import { Forwarder } from "@ndn/fw";
import { Name } from "@ndn/packet";
import { strict as assert } from "assert";
(async () => {
if (process.env.CI) { return; }
```

## Query NDN-FCH Service

`queryFch` function sends a query to NDN-FCH service.

```ts
// The simplest query:
let hosts = await queryFch();
assert.equal(hosts.length, 1);
console.log("closest HUB", hosts);

// Ask for multiple routers:
hosts = await queryFch({ count: 4 });
assert(hosts.length > 1);
console.log("four routers", hosts);

// Ask for secure WebSocket capability:
hosts = await queryFch({ capabilities: ["wss"] });
console.log("supports secure WebSocket", hosts);

// Ask for router at specific location:
hosts = await queryFch({ position: [121.403351, 31.007990] }); // eslint-disable-line unicorn/no-zero-fractions
console.log("near @yoursunny's birthplace", hosts);
```

## Connect to Testbed

```ts
const fw = Forwarder.create();

// Create up to four faces, and consider default IPv4 gateway as a candidate.
// In case NDN-FCH is unavailable, use a list of backup routers.
let faces = await connectToTestbed({
  count: 4,
  fw,
  tryDefaultGateway: true,
  fchFallback: ["hobo.cs.arizona.edu", "titan.cs.memphis.edu"],
});
assert(faces.length > 0);
for (const face of faces) {
  console.log("connected to", `${face}`);
  face.close();
}

// Try up to four candidates with 3-second timeout, and keep the fastest face only.
faces = await connectToTestbed({
  count: 4,
  fw,
  preferFastest: true,
  connectTimeout: 3000,
  testConnection: new Name(`/ndn/edu/arizona/ping/${Math.floor(Math.random() * 1e9)}`),
  tryDefaultGateway: false,
});
assert.equal(faces.length, 1);
const [fastestFace] = faces;
console.log("fastest face is", `${fastestFace}`);

// By default, default route "/" is added to the face, so that you can send Interests right away.
await new Endpoint({ fw }).consume(`/ndn/edu/ucla/ping/${Math.floor(Math.random() * 1e9)}`);

fastestFace.close();
```

```ts
})();
```
