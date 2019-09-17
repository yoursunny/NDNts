import duplexify from "duplexify";
import { ObjectReadableMock, ObjectWritableMock } from "stream-mock";

import { DatagramTransport, LLFace } from "../src";

test("error on unknown TLV-TYPE", (done) => {
  expect.hasAssertions();

  const rxRemote = new ObjectReadableMock([
    Buffer.from([0xF0, 0x00]),
  ]);
  const face = new LLFace(new DatagramTransport(duplexify.obj(new ObjectWritableMock(), rxRemote)));

  face.rxError.add(async () => {
    await expect(face.close()).resolves.toBeUndefined();
    done();
  });
});
