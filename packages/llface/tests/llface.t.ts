import duplexify from "duplexify";
import * as rPromise from "remote-controlled-promise";
import { ObjectReadableMock, ObjectWritableMock } from "stream-mock";

import { DatagramTransport, LLFace } from "../src";

test("error on unknown TLV-TYPE", async () => {
  const rxRemote = new ObjectReadableMock([
    Buffer.from([0xF0, 0x00]),
  ]);
  const face = new LLFace(new DatagramTransport(duplexify.obj(new ObjectWritableMock(), rxRemote)));

  const rxErrorP = rPromise.create<Error>();
  face.once("rxerror", (error: Error) => rxErrorP.resolve(error));
  const rxError = await rxErrorP.promise;
  expect(rxError).toBeInstanceOf(LLFace.DecodeError);
  expect((rxError as LLFace.DecodeError).toString()).toMatch(/F000/);

  await expect(face.close()).resolves.toBeUndefined();
});
