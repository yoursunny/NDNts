# @ndn/lp

This package is part of [NDNts](https://yoursunny.com/p/NDNts/), Named Data Networking libraries for the modern web.

This package implements [NDNLPv2](https://redmine.named-data.net/projects/nfd/wiki/NDNLPv2) link protocol.
Currently, a minimal implementation strips unrecognized headers, and extracts non-fragmented payload out of LpPacket for processing in L3 decoder.
