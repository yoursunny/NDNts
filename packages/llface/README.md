# @ndn/llface

This package is part of [NDNts](https://yoursunny.com/p/NDNts/), Named Data Networking libraries for the modern web.

This package implements low-level face abstraction and transport base types.

```ts
import { LLFace, StreamTransport } from "@ndn/llface";

// other imports for examples
import { Data, Interest, LLSign, SigInfo, SigType } from "@ndn/l3pkt";
import { strict as assert } from "assert";
import duplexify from "duplexify";
import { PassThrough } from "readable-stream";
(async () => {
```

## LLFace: Low-Level Face

The **LLFace**, or low-level face, allows sending and receiving layer-3 packets on a stream or datagram transport.
LLFace does not provide Interest-Data matching logic, timeout scheduler, etc.
It is more like a forwarder's face abstraction.

```ts
// Give me a moment to get some plumbing ready.
const connAB = new PassThrough();
const connBA = new PassThrough();
const endA = duplexify(connAB, connBA);
const endB = duplexify(connBA, connAB);
const close = () => setTimeout(() => { endA.destroy(); endB.destroy(); }, 100);
connAB.on("end", close);
connBA.on("end", close);

// I'm ready. Let's create two faces connected to each other.
const faceA = new LLFace(new StreamTransport(endA));
const faceB = new LLFace(new StreamTransport(endB));

await Promise.all([
  // TX side is a function that accepts an AsyncIterable.
  // Here we send an Interest and then close the face.
  faceA.tx({ async *[Symbol.asyncIterator]() {
    const interest = new Interest("/A", Interest.CanBePrefix);
    yield interest;
  }}),

  // RX side is an AsyncIterable that yields either Interest or Data.
  // Here we assume it's Interest.
  // We process the Interest, and then yield the Data to the TX side.
  faceB.tx({ async *[Symbol.asyncIterator]() {
    for await (const pkt of faceB.rx) {
      const interest = pkt as Interest;
      assert.equal(interest.name.toString(), "/A");
      assert.equal(interest.canBePrefix, true);
      assert.equal(interest.mustBeFresh, false);

      const data = new Data("/A/B", new Uint8Array([0xB0, 0xB1, 0xB2, 0xB3]));
      data.sigInfo = new SigInfo(SigType.Sha256);
      data[LLSign.PENDING] = async () => new Uint8Array([0xF0, 0xF1]);

      // Send a Data using sendData() method.
      // Signing is processed internally.
      yield data;
    }
  }}),

  // Receive the Data.
  (async () => {
    for await (const pkt of faceA.rx) {
      const data = pkt as Data;
      assert.equal(data.name.toString(), "/A/B");
      assert.equal(data.content.length, 4);
      assert.equal(data.sigValue.length, 2);
    }
  })(),
]);
```

```ts
})();
```
