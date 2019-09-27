# @ndn/node-transport

This package is part of [NDNts](https://yoursunny.com/p/NDNts/), Named Data Networking libraries for the modern web.

This package implements TCP/Unix socket transport for Node.js environment.

```ts
import { SocketTransport } from "@ndn/node-transport";

// other imports for examples
import { Data, Interest } from "@ndn/l3pkt";
import { LLFace } from "@ndn/llface";
import * as rPromise from "remote-controlled-promise";
(async () => {
if (process.env.CI) { return; }
```

## SocketTransport for TCP and Unix

The **SocketTransport** communicates with a socket from Node.js ["net" package](https://nodejs.org/api/net.html).

```ts
// Create a SocketTransport connected to a router.
// It accepts the same 'options' as net.createConnection(), so it supports both TCP and Unix.
const transport = await SocketTransport.connect({ host: "hobo.cs.arizona.edu", port: 6363 });

// Create a low-level face using this transport.
const face = new LLFace(transport);

// We want to know if something goes wrong.
face.on("rxerror", console.warn);

// Send five Interests.
let count = 5;
let i = Math.floor(Math.random() * 99999999);
const interval = setInterval(() => {
  const interest = new Interest(`/ndn/edu/arizona/ping/NDNts/${i++}`);
  console.log("< I", interest.name.toString());
  face.sendInterest(interest);
  if (--count <= 0) {
    clearInterval(interval);
  }
}, 50);

const done = rPromise.create<void>();
setTimeout(() => done.resolve(undefined), 4000).unref();

let nData = 0;
// Print incoming Data names.
face.on("data", (data: Data) => {
  console.log("> D", data.name.toString());
  if (++nData >= 5) {
    done.resolve(undefined);
  }
});
await done.promise;

// Close the face when we are done. This closes the transport.
face.close();
```

```ts
})();
```
