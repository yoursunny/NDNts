# @ndn/ws-transport

This package is part of [NDNts](https://yoursunny.com/p/NDNts/), Named Data Networking libraries for the modern web.

This package implements a WebSocket transport.
It works in both Node and browser.

You can create a forwarder face that uses WebSocket transport with `WsTransport.createFace()` function.
To create a WebSocket transport without wrapping into L3Face, use `WsTransport.connect()` function.

```ts
import { WsTransport } from "@ndn/ws-transport";

// other imports for examples
import { Endpoint } from "@ndn/endpoint";
import { Data, Interest, Name } from "@ndn/packet";

if (process.env.CI) { process.exit(0); }

// Create a WebSocket face.
// Unless otherwise specified, the face is added to the default Forwarder instance.
// You may set an alternate Forwarder instance in the first argument.
//
// A route for "/" prefix is added automatically.
// You may customize the route prefixes via addRoutes property in the first argument.
const uplink = await WsTransport.createFace({}, "wss://hobo.cs.arizona.edu/ws/");

// Construct an Endpoint on the default Forwarder instance.
const endpoint = new Endpoint();

// We can now send Interests and retrieve Data.
let seq = Math.trunc(Math.random() * 1e8);
for (let i = 0; i < 5; ++i) {
  try {
    const interest = new Interest(`/ndn/edu/arizona/ping/NDNts/${seq++}`);
    console.log(`<I ${interest.name}`);
    const data = await endpoint.consume(interest);
    console.log(`>D ${data.name}`);
  } catch (err: unknown) {
    console.warn(err);
  }
}

// In case a socket error occurs, the transport will attempt to reconnect automatically,
// although packets transmitted during that time would be lost. The reconnecting logic
// is implemented in L3Face class from @ndn/l3face package.

// When the face is no longer needed, close it.
uplink.close();
```
