import duplexify from "duplexify";
import { PassThrough } from "readable-stream";

import { DatagramTransport } from "../src";
import * as TestTransport from "../test-fixture/transport";

test("simple", async () => {
  const connAB = new PassThrough({ objectMode: true });
  const connBA = new PassThrough({ objectMode: true });
  const tA = new DatagramTransport(duplexify.obj(connAB, connBA));
  const tB = new DatagramTransport(duplexify.obj(connBA, connAB));
  TestTransport.check(await TestTransport.execute(tA, tB));
});
