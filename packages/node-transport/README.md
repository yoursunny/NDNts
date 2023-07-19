# @ndn/node-transport

This package is part of [NDNts](https://yoursunny.com/p/NDNts/), Named Data Networking libraries for the modern web.

This package implements socket transports for Node.js environment.

```ts
import { TcpTransport, UdpTransport, UnixTransport } from "@ndn/node-transport";

// other imports for examples
import { FwPacket } from "@ndn/fw";
import { type Transport, L3Face } from "@ndn/l3face";
import { Data, Interest } from "@ndn/packet";
import { delay } from "@ndn/util";

if (process.env.CI) { process.exit(0); }
```

## Transport Types

There are three transport types:

* UnixTransport: Unix socket or Windows named pipe.
* TcpTransport: TCP tunnel (IPv4 or IPv6).
* UdpTransport: UDP unicast tunnel (IPv4 or IPv6) or UDP multicast group (IPv4 only).

The `connect()` function of each transport creates a transport.

```ts
// UnixTransport.connect() establishes a UNIX socket connection.
// It accepts a Unix socket path.
try {
  const unix = await UnixTransport.connect(process.env.DEMO_NFD_UNIX ?? "/run/nfd.sock");
  await useInL3Face(unix);
} catch (err: unknown) { // NFD is not running
  console.warn("unix", err);
}

// TcpTransport.connect() establishes a TCP tunnel.
// It accepts either host+port or an options object for net.connect().
try {
  const tcp4 = await TcpTransport.connect("hobo.cs.arizona.edu", 6363);
  await useInL3Face(tcp4);
} catch (err: unknown) { // router unavailable
  console.warn("tcp4", err);
}

// Select IPv4 with `family: 4` or select IPv6 with `family: 6`. Default is both.
try {
  const tcp6 = await TcpTransport.connect({ host: "ndnhub.ipv6.lip6.fr", family: 6 });
  await useInL3Face(tcp6);
} catch (err: unknown) { // router unavailable
  console.warn("tcp6", err);
}

// UdpTransport.connect() establishes a UDP tunnel.
try {
  const udp4 = await UdpTransport.connect("hobo.cs.arizona.edu");
  await useInL3Face(udp4);
} catch (err: unknown) { // router unavailable
  console.warn("udp4", err);
}

// Select IPv6 with `family: 6`. Default is IPv4 only, unless host is a literal IPv6 address.
try {
  const udp6 = await UdpTransport.connect({ host: "ndnhub.ipv6.lip6.fr", family: 6 });
  await useInL3Face(udp6);
} catch (err: unknown) { // router unavailable
  console.warn("udp6", err);
}
```

To use UDP multicast, each network interface needs to have a separate transport.
It's easiest to let NDNts automatically create transports on every network interface.

```ts
// UdpTransport.multicasts() attempts to create UDP multicast transports on every
// network interface, skipping network interfaces where socket creation fails.
const multicasts = await UdpTransport.multicasts();
for (const transport of multicasts) {
  await useInL3Face(transport);
}
```

## How to Use a Transport

Transports are normally used to construct **L3Face** objects (from `@ndn/l3face` package), which are in turn added to the **Forwarder** (from `@ndn/fw` package).
Each transport provides a `createFace` convenience function to construct a transport and add it to the forwarder.

See `@ndn/ws-transport` package documentation for a complete example of `createFace` function.

```ts
// UdpTransport.createFace() constructs a UDP unicast transport, and adds it to a forwarder.
// First parameters allows setting L3Face attributes and NDNLP service options, or attaching
// the face to a non-default Forwarder instance. This argument is required.
// Subsequent parameters are same as the corresponding connect() function.
// It returns a FwFace instance (from @ndn/fw package).
const face = await UdpTransport.createFace({}, "hobo.cs.arizona.edu");
face.close();
// TcpTransport.createFace() and UnixTransport.createFace() behave similarly.

// UdpTransport.createMulticastFaces() constructs UDP multicast transports on every network
// interface and adds them to a forwarder.
const faces = await UdpTransport.createMulticastFaces({});
for (const face of faces) {
  face.close();
}
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
  face.addEventListener("rxerror", (evt) => console.warn(evt.detail));
  face.addEventListener("txerror", (evt) => console.warn(evt.detail));

  await Promise.all([
    face.tx({ async *[Symbol.asyncIterator]() {
      // Send five Interests.
      let seq = Math.trunc(Math.random() * 1e8);
      for (let i = 0; i < 5; ++i) {
        await delay(50);
        const interest = new Interest(`/ndn/edu/arizona/ping/NDNts/${seq++}`);
        console.log(`${transport} <I ${interest.name}`);
        yield FwPacket.create(interest);
      }
      await delay(500);
    } }),
    (async () => {
      let nData = 0;
      for await (const { l3 } of face.rx) {
        if (!(l3 instanceof Data)) {
          continue;
        }
        // Print incoming Data name.
        console.log(`${transport} >D ${l3.name}`);
        if (++nData >= 5) {
          return;
        }
      }
    })(),
  ]);

  // L3Face and Transport are automatically closed when TX iterable is exhausted.
}
```
