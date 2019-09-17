import duplexify = require("duplexify");
import { PassThrough } from "readable-stream";

import { DatagramTransport } from "../src";
import { testTransport } from "../test-fixture";

test("simple", async () => {
  const connAB = new PassThrough({ objectMode: true });
  const connBA = new PassThrough({ objectMode: true });
  const tA = new DatagramTransport(duplexify.obj(connAB, connBA));
  const tB = new DatagramTransport(duplexify.obj(connBA, connAB));
  await testTransport(tA, tB);
});
