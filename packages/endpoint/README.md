# @ndn/endpoint

This package is part of [NDNts](https://yoursunny.com/p/NDNts/), Named Data Networking libraries for the modern web.

This package implements **Endpoint** type, which is the basic abstraction through which an application can communicate with the NDN network.

An endpoint is similar to a "client face" in other NDN libraries, with the enhancement that it handles these details automatically:

* [X] Outgoing packets are signed and incoming packets are verified, if trust schema is provided.
* [X] Outgoing Interests are retransmitted periodically, if retransmission policy is specified.
* [X] Outgoing Data buffer, if enabled, allows the producer to reply to one Interest with multiple Data (e.g. segments), or push generated Data without receiving an Interest.
      Data will be sent automatically upon Interest arrival.
* [X] The underlying transport is reconnected upon failure, if transport failure policy is specified  (implemented in `@ndn/l3face` package).
* [ ] Prefix registrations are refreshed periodically or upon transport reconnection.
