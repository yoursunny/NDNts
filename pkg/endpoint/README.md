# @ndn/endpoint

This package is part of [NDNts](https://yoursunny.com/p/NDNts/), Named Data Networking libraries for the modern web.

This package implements the *endpoint* concept, consisting of `consume` and `produce` functions.
These are the basic abstractions through which an application can communicate with the NDN network.

The endpoint concept is similar to a "client face" in other NDN libraries, with the enhancement that it handles these details automatically:

* [X] Outgoing packets are signed and incoming packets are verified, if trust schema is provided.
* [X] Outgoing Interests are retransmitted periodically, if retransmission policy is specified.
* [X] Outgoing Data buffer, if enabled, allows the producer to reply to one Interest with multiple Data (e.g. segments), or push generated Data without receiving an Interest.
      Data will be sent automatically upon Interest arrival.
* [X] The underlying transport is reconnected upon failure, if transport failure policy is specified (implemented in `@ndn/l3face` package).
* [X] Prefix registrations are refreshed periodically or upon transport reconnection (implemented in `@ndn/nfdmgmt` package).

## `Endpoint` class deprecated

The `Endpoint` class allows inheriting consumer/producer options from constructor parameters to each consumer/producer created by `endpoint.consume()` and `endpoint.produce()` methods.
This design can cause surprising behavior when the same `Endpoint` instance is reused in different parts of the application.
Therefore, `Endpoint` class is deprecated in favor of `consume()` and `produce()` standalone functions.

Going forward, APIs that currently accept `Endpoint` as an option should accept `ConsumerOptions` or `ProducerOptions` instead.
They may support options inheritance via spread syntax.

`@deprecated` tag will be added after NDNts codebase stops relying on Endpoint class.
Removal would not occur until at least 90 days after adding `@deprecated` tag.
