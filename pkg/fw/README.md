# @ndn/fw

This package is part of [NDNts](https://yoursunny.com/p/NDNts/), Named Data Networking libraries for the modern web.

This package implements the logical forwarder, the central piece of NDN stack.
It exports a **Forwarder** type that represents the logical forwarder, and a **FwFace** type that represents a *face* attached to the logical forwarder.

## Concepts

You may be wondering: why there's a forwarder in my application?
The main purpose is to demultiplex incoming packets.
Suppose a producer application can serve multiple kinds of data, the logical forwarder can dispatch incoming Interests of each kind of data to the correct Interest handler function in the application, so that the application does not perform this dispatching itself.

This leads to our definition of the *face*: **a face is a duplex stream of packets**.
It could be a connection to another network node or standalone forwarder, as implemented in `@ndn/l3face` package.
It could also be a part of application logic, as implemented in `@ndn/endpoint` package.
Creating a `FwFace` for application logic is a cheap operation: if you need to receive different kinds of packets in separate callback functions, you should create one face per callback function, instead of sharing the same face and attempting to dispatch packets yourself.

A *packet* transmitted or received on an `FwFace` is typically an Interest or a Data.
From application logic, it is possible to associate arbitrary metadata, called a *token*, on an outgoing Interest, and receive them back on the corresponding Data.
You can also send a `CancelInterest` command to cancel a pending Interest, and receive a `RejectInterest` notice when the Interest is canceled or has expired.
Obviously, these tokens and commands are not encodable, so they are only available for communication between application logic and the logical forwarder, but cannot appear beyond the NDNts application.

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

## Prefix Registration / Readvertisement

Unlike many other NDN libraries, NDNts does not hard-wire prefix registration toward a particular forwarder.
Instead, the prefix registration functionality is structured more like a router:

* `FwFace` can *announce* a prefix into the NDNts logical forwarder.
* The logical forwarder can then *readvertise* the prefix into a *destination* such as a remote forwarder.

NDNts includes several `ReadvertiseDestination` implementation compatible with other forwarders:

* `@ndn/nfdmgmt` implements the NFD Management protocol, compatible with NFD and NDNd.
* `@ndn/dpdkmgmt` implements the NDN-DPDK GraphQL protocol, compatible with NDN-DPDK.

After loading either package and attaching to the logical forwarder, prefix registration commands would be transmitted toward the connected forwarder.
In contrast, if no `ReadvertiseDestination` is attached to a logical forwarder, the producer prefixes from a `FwFace` are visible within the logical forwarder and no prefix registration commands would be sent.

A `FwFace` may prevent its prefixes from being readvertised by setting `advertiseFrom: false` attribute.
If this attribute is set, the prefixes announced by this `FwFace` are only visible within the logical forwarder but ignored by `Readvertise` module.
This attribute is normally set on a `FwFace` that represents an uplink to a remote forwarder, so that its prefixes (often the default route `/`) do not leak to another uplink that you may be connecting.
In contrast, having `advertiseFrom: true` attribute (the default) does not magically enable prefix registration commands if you do not have a `ReadvertiseDestination` attached.

### Readvertise Module Architecture

The readvertise module consists of:

* One `Readvertise` class instance integrated with the logical forwarder.
* One or more `ReadvertiseDestination` subclass instances attached to the `Readvertise` instance.

The `Readvertise` class is responsible for:

* When a prefix is announced by the first `FwFace`, send an advertise (register) command to each destination.
* When a prefix is unannounced by the last `FwFace`, send a withdraw (unregister) command to each destination.
* If the same prefix is announced by multiple `FwFace`s or by the same `FwFace` more than once, it is deduplicated automatically and would not cause duplicate advertise commands or premature withdraw commands.

The `ReadvertiseDestination` base class is responsible for:

* Maintain a queue of pending advertise and withdraw commands to be processed by the subclass.
* Maintain a state of each prefix, with one of four statuses: ADVERTISING, ADVERTISED, WITHDRAWING, WITHDRAWN.
* If an advertise or withdraw command fails, automatically retry the command.
* If the prefix is withdrawn while an advertise command is being executed, immediately send a withdraw command afterward, to ensure state consistency.

Each `ReadvertiseDestination` subclass is responsible for:

* Implement the prefix registration protocol understood by the connected forwarder.
* Actually transmit the advertise and withdraw commands, and inform the base class of the success/failure outcome.
  * If the commands require NDN signatures, manage the signing and certificate publishing.
* Refresh the advertised prefixes (i.e. schedule resending advertise commands) in case of connectivity change.
  * For example, if `TcpTransport` reconnects to NFD, it would be seen by NFD as a new face, so that every prefix must be registered again to maintain connectivity.
