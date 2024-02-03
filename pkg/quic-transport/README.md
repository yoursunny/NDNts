# @ndn/quic-transport

This package is part of [NDNts](https://yoursunny.com/p/NDNts/), Named Data Networking libraries for the modern web.

This package implements an HTTP/3 client transport using [WebTransport API](https://developer.mozilla.org/en-US/docs/Web/API/WebTransport).
It is designed to work with [NDN HTTP/3 WebTransport gateway](https://github.com/yoursunny/NDN-webtrans).

You can create a forwarder face that uses HTTP/3 transport with `H3Transport.createFace()` function.
To create an HTTP/3 transport without wrapping into L3Face, use `H3Transport.connect()` function.
