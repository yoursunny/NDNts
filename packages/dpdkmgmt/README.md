# @ndn/nfdmgmt

This package is part of [NDNts](https://yoursunny.com/p/NDNts/), Named Data Networking libraries for the modern web.

This package enables interaction with [NDN-DPDK high-speed forwarder](https://github.com/usnistgov/ndn-dpdk).
It can create faces (either UDP or memif) for the NDNts application, and perform prefix registrations.

Currently, there are several limitations using this package:

* You can have only one memif face; UDP faces are unlimited but slower.
* Prefix registration replaces a FIB entry, and does not preserve other prefix registrations on the same prefix.
* If the application crashes, the face would not be closed on NDN-DPDK side.

```ts
import { openFace } from "@ndn/dpdkmgmt";

// other imports for examples
import { Endpoint } from "@ndn/endpoint";
import { Forwarder } from "@ndn/fw";
import { Name, Interest, Data } from "@ndn/packet";
import { fromUtf8, toUtf8 } from "@ndn/tlv";
import { strict as assert } from "node:assert";

(async () => {

const gqlServer = process.env.DEMO_DPDKMGMT_GQLSERVER;
const localHost = process.env.DEMO_DPDKMGMT_LOCAL;
const useMemif = process.env.DEMO_DPDKMGMT_MEMIF;
if (!gqlServer) {
  console.log(`
To run @ndn/dpdkmgmt demo, set the following environment variables:
DEMO_DPDKMGMT_GQLSERVER= NDN-DPDK forwarder management endpoint (required)
DEMO_DPDKMGMT_LOCAL= IP address to reach local host from NDN-DPDK (optional)
DEMO_DPDKMGMT_MEMIF=C use memif instead of UDP for consumer face (optional)
DEMO_DPDKMGMT_MEMIF=P use memif instead of UDP for producer face (optional)
`);
  return;
}

// Topology of this demo
//
// producer                      consumer
//    |                              |
//   fwP                            fwC
//    \---------- NDN-DPDK ----------/
//       uplinkP            uplinkC

// Create two logical forwarders, one as consumer and one as producer.
const fwC = Forwarder.create();
const fwP = Forwarder.create();

// Connect to NDN-DPDK.
const uplinkC = await openFace({
  fw: fwC,
  gqlServer,
  localHost,
  scheme: useMemif === "C" ? "memif" : "udp",
});
uplinkC.addRoute(new Name("/"));
const uplinkP = await openFace({
  fw: fwP,
  gqlServer,
  localHost,
  scheme: useMemif === "P" ? "memif" : "udp",
});
console.log(`uplinkC=${uplinkC}`, `uplinkP=${uplinkP}`);

// Start a producer.
const producer = new Endpoint({ fw: fwP }).produce("/P",
  async (interest) => {
    console.log("producing");
    return new Data(interest.name, Data.FreshnessPeriod(1000), toUtf8("NDNts + NDN-DPDK"));
  });
await new Promise((r) => setTimeout(r, 500));

// Start a consumer, fetching Data from the producer via NDN-DPDK.
const data = await new Endpoint({ fw: fwC }).consume(
  new Interest(`/P/${Math.floor(Math.random() * 1e9)}`, Interest.MustBeFresh),
);
const payloadText = fromUtf8(data.content);
console.log("received", `${data.name} ${payloadText}`);
assert.equal(payloadText, "NDNts + NDN-DPDK");

// Close faces.
producer.close();
await new Promise((r) => setTimeout(r, 500));
uplinkC.close();
uplinkP.close();
})();
```
