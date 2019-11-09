# @ndn/node-transport

This package is part of [NDNts](https://yoursunny.com/p/NDNts/), Named Data Networking libraries for the modern web.

This package implements TCP/Unix socket transport for Node.js environment.

```ts
import { SocketTransport, UdpTransport } from "@ndn/node-transport";

// other imports for examples
import { L3Face, Transport } from "@ndn/l3face";
import { Data, Interest } from "@ndn/l3pkt";
(async () => {
if (process.env.CI) { return; }
```

## SocketTransport for TCP and Unix

The **SocketTransport** communicates with a socket from Node.js ["net" package](https://nodejs.org/api/net.html).

```ts
// Create a SocketTransport connected to a router.
// It accepts the same options as net.createConnection(), so it supports both TCP and Unix.
const tcp = await SocketTransport.connect({ host: "hobo.cs.arizona.edu", port: 6363 });
await useTransportInFace(tcp);
```

## UdpTransport

The **UdpTransport** establishes a UDP tunnel.
It supports IPv4 only.

```ts
const udp = await UdpTransport.connect({ host: "hobo.cs.arizona.edu" });
await useTransportInFace(udp);
```

```ts
})();
async function useTransportInFace(transport: Transport) {

// Transports are normally used in a network layer face.
const face = new L3Face(transport);

// We want to know if something goes wrong.
face.on("rxerror", (err) => console.warn(err));
face.on("txerror", (err) => console.warn(err));

await Promise.all([
  face.tx({ async *[Symbol.asyncIterator]() {
    // Send five Interests.
    let seq = Math.floor(Math.random() * 99999999);
    for (let i = 0; i < 5; ++i) {
      await new Promise((r) => setTimeout(r, 50));
      const interest = new Interest(`/ndn/edu/arizona/ping/NDNts/${seq++}`);
      console.log(`${transport} <I ${interest.name}`);
      yield interest;
    }
    await new Promise((r) => setTimeout(r, 200));
  } }),
  (async () => {
    let nData = 0;
    for await (const pkt of face.rx) {
      if (!(pkt instanceof Data)) {
        continue;
      }
      // Print incoming Data name.
      const data: Data = pkt;
      console.log(`${transport} >D ${data.name}`);
      if (++nData >= 5) {
        return;
      }
    }
  })(),
]);

// Face and transport are automatically closed when TX iterable is exhausted.
}
```
