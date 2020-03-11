# @ndn/node-transport

This package is part of [NDNts](https://yoursunny.com/p/NDNts/), Named Data Networking libraries for the modern web.

This package implements socket transports for Node.js environment.

```ts
import { TcpTransport, UdpTransport } from "@ndn/node-transport";

// other imports for examples
import { L3Face, Transport } from "@ndn/l3face";
import { Data, Interest } from "@ndn/packet";
(async () => {
if (process.env.CI) { return; }
```

## Transport Types

There are three transport types:

* UnixTransport: Unix socket, or Windows named pipe.
* TcpTransport: TCP tunnel.
* UdpTransport: UDP tunnel.

```ts
// TcpTransport.connect() establishes a TCP tunnel.
// It accepts either host+port or an options object for net.createConnection().
const tcp = await TcpTransport.connect("hobo.cs.arizona.edu", 6363);
await useInL3Face(tcp);

// UdpTransport.connect() establishes a UDP tunnel.
// It supports IPv4 only.
const udp = await UdpTransport.connect({ host: "hobo.cs.arizona.edu" });
await useInL3Face(udp);

})();
```

## How to Use a Transport

Transports are normally used to construct **L3Face** objects (from `@ndn/l3face` package).
L3Face allows sending and receiving layer-3 packets on a transport.
L3Face does not provide Interest-Data matching logic, timeout scheduler, etc.
It is more like a forwarder's face.

This section presents the low-level details of how to use a "raw" transport with `L3Face` class.

```ts
async function useInL3Face(transport: Transport) {

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

  // L3Face and Transport are automatically closed when TX iterable is exhausted.

}
```
