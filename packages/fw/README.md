# @ndn/fw

This package is part of [NDNts](https://yoursunny.com/p/NDNts/), Named Data Networking libraries for the modern web.

This package implements the forwarding plane, the central piece of NDN stack.
It exports a **Forwarder** type that represents the forwarding plane, and a **FwFace** type that represents a *face* attached to the forwarding plane.

## Concepts

You may be wondering: why there's a forwarding plane in my application?
The main purpose is to demultiplex incoming packets.
Suppose a producer application can serve multiple kinds of data, the forwarding plane can dispatch incoming Interests of each kind of data to the correct Interest handler function in the application, so that the application does not perform this dispatching itself.

This leads to our definition of the *face*: **a face is a duplex stream of packets**.
It could be a connection to another network node or standalone forwarder, as implemented in `@ndn/l3face` package.
It could also be a part of application logic, as implemented in `@ndn/endpoint` package.
Creating a `FwFace` for application logic is relatively cheap: if you need to receive different kinds of packets in separate callback functions, you should create one face per callback function, instead of sharing the same face and attempting to dispatch packets yourself.

A *packet* transmitted or received on an `FwFace` is typically an Interest or a Data.
From application logic, it is possible to associate arbitrary metadata, called a *token*, on an outgoing Interest, and receive them back on the corresponding Data.
You can also send a `CancelInterest` command to cancel a pending Interest, and receive a `RejectInterest` notice when the Interest is canceled or has expired.
Obviously, these tokens and commands are not encodable, so they are only available for communication between application logic and the forwarding plane, but cannot appear beyond the NDNts application.

## Forwarding Behavior

It's sad but NDN does not have a formal forwarding behavior specification.
This package implements a simplified version of NDN forwarding behavior specified in [NDN-LAN dissertation](https://hdl.handle.net/10150/625652) chapter 3.
The main differences from a full forwarder include:

* Forwarding strategy is dumb.
* No Interest aggregation.
* No Content Store (CS).
  * If your application needs data packet caching, use `@ndn/repo` package.
* No Nack generation or processing.
* Limited forwarding hint processing:
  * Only the first delegation name is considered. Others are ignored.
  * If the first delegation name is a prefix of one of the configured node names, FIB lookup uses the Interest name; otherwise, FIB lookup uses the first delegation name.
  * Forwarding hint is not stripped even if it matches a configured node name.

These are subject to change.
