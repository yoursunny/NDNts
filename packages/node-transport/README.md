# @ndn/node-transport

This package is part of [NDNts](https://yoursunny.com/p/NDNts/), Named Data Networking libraries for the modern web.

This package implements socket transports for Node.js environment.

```ts
import { TcpTransport, UdpTransport, UnixTransport } from "@ndn/node-transport";

// other imports for examples
import { L3Face, Transport } from "@ndn/l3face";
import { Data, Interest, Name } from "@ndn/packet";
(async () => {
if (process.env.CI) { return; }
```

## Transport Types

There are three transport types:

* UnixTransport: Unix socket or Windows named pipe.
* TcpTransport: TCP tunnel, IPv4 only.
* UdpTransport: UDP unicast tunnel or UDP multicast group, IPv4 only.

The `connect()` function of each transport creates a transport.

```ts
// UnixTransport.connect() establishes a UNIX socket connection.
// It accepts a Unix socket path.
try {
  const unix = await UnixTransport.connect("/run/nfd.sock");
  await useInL3Face(unix);
} catch (err: unknown) {
  // This above would throw an error on Windows or if NFD is not running.
  console.warn(err);
}

// TcpTransport.connect() establishes a TCP tunnel.
// It accepts either host+port or an options object for net.createConnection().
const tcp = await TcpTransport.connect("hobo.cs.arizona.edu", 6363);
await useInL3Face(tcp);

// UdpTransport.connect() establishes a UDP tunnel.
// It supports IPv4 only.
const udp = await UdpTransport.connect({ host: "hobo.cs.arizona.edu" });
await useInL3Face(udp);
```

To use UDP multicast, each network interface needs to have a separate transport.
It's easiest to let NDNts automatically create transports on every network interface.

```ts
// UdpTransport.multicasts() attempts to create UDP multicast transports on every
// network interface, skipping network interfaces where socket creation fails.
const multicasts = await UdpTransport.multicasts();
multicasts.forEach(async (transport, i) => {
  if (i === 0) {
    await useInL3Face(transport);
  } else {
    transport.close();
  }
});
```

## How to Use a Transport

Transports are normally used to construct **L3Face** objects (from `@ndn/l3face` package), which are in turned add to the **Forwarder** (from `@ndn/fw` package).
Each transport provides a `createFace` convenience function to construct a transport and add it to the forwarder.

See `@ndn/ws-transport` package documentation for a complete example of `createFace` function.

```ts
// UdpTransport.createFace() constructs a UDP unicast transport, and adds it to a forwarder.
// First parameters allows setting L3Face attributes and NDNLP service options, or attaching
// the face to a non-default Forwarder instance. This argument is required.
// Subsequent parameters are same as the corresponding connect() function.
// It returns a FwFace instance (from @ndn/fw package).
const face = await UdpTransport.createFace({}, "hobo.cs.arizona.edu");
face.addRoute(new Name("/ndn"));
face.close();
// TcpTransport.createFace() and UnixTransport.createFace() behave similarly.

// UdpTransport.createMulticastFaces() constructs UDP multicast transports on every network
// interface and adds them to a forwarder.
const faces = await UdpTransport.createMulticastFaces({});
faces.forEach((face) => face.close());
})();
```

## L3Face Low-Level Details

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
