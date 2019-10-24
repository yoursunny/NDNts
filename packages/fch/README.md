# @ndn/fch

This package is part of [NDNts](https://yoursunny.com/p/NDNts/), Named Data Networking libraries for the modern web.

This package enables connection to global NDN testbed using [NDN-FCH service](https://github.com/named-data/ndn-fch/).

```ts
import { queryFch, connectToTestbed } from "@ndn/fch";

// other imports for examples
import { Forwarder } from "@ndn/fw";
(async () => {
if (process.env.CI) { return; }
```

## Query NDN-FCH Service

`queryFch` function sends a query to NDN-FCH service.

```ts
// The simplest query:
let hosts = await queryFch();
console.log("closest HUB", hosts);

// Ask for multiple routers:
hosts = await queryFch({ count: 4 });
console.log("four routers", hosts);

// Ask for secure WebSocket capability:
hosts = await queryFch({ capabilities: ["wss"] });
console.log("supports secure WebSocket", hosts);

// Ask for router at specific location:
hosts = await queryFch({ position: [121.403351, 31.007990] });
console.log("near @yoursunny's birthplace", hosts);
```

## Connect to Testbed

```ts
const fw = Forwarder.create();
const faces = await connectToTestbed({
  count: 4,
  fw,
});
faces.forEach((face) => console.log("connected to", `${face}`));
faces.forEach((face) => face.close());
```

```ts
})();
```
