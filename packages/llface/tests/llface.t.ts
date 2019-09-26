import { Interest, ISigInfo, LLSign, SigType } from "@ndn/l3pkt";
import delay from "delay";
import duplexify from "duplexify";
import * as rPromise from "remote-controlled-promise";
import { ObjectReadableMock, ObjectWritableMock } from "stream-mock";

import { DatagramTransport, LLFace } from "../src";

test("RX error on unknown TLV-TYPE", async () => {
  const rxRemote = new ObjectReadableMock([
    Buffer.from([0xF0, 0x00]),
  ]);
  const face = new LLFace(new DatagramTransport(duplexify.obj(new ObjectWritableMock(), rxRemote)));

  const rxErrorP = rPromise.create<LLFace.RxError>();
  face.once("rxerror", (error) => rxErrorP.resolve(error));
  const rxError = await rxErrorP.promise;
  expect(rxError.toString()).toMatch(/F000/);

  await expect(face.close()).resolves.toBeUndefined();
});

test("TX signing", async () => {
  const txRemote = new ObjectWritableMock();
  const face = new LLFace(new DatagramTransport(duplexify.obj(txRemote, new ObjectReadableMock([]))));

  const signFn = jest.fn(async (input: Uint8Array) => {
    return new Uint8Array([0xA0, 0xA1, 0xA2, 0xA3]);
  });
  const interest = new Interest("/A");
  interest.sigInfo = new ISigInfo();
  interest.sigInfo.type = SigType.Sha256;
  interest[LLSign.PENDING] = signFn;
  face.sendInterest(interest);

  await delay(5);
  expect(signFn).toHaveBeenCalledTimes(1);
  expect(txRemote.data).toHaveLength(1);
  expect(Array.from(txRemote.data[0])).toEqual(expect.arrayContaining([0xA0, 0xA1, 0xA2, 0xA3]));
});

test("TX signing error", async () => {
  const txRemote = new ObjectWritableMock();
  const face = new LLFace(new DatagramTransport(duplexify.obj(txRemote, new ObjectReadableMock([]))));
  const txErrorP = rPromise.create<LLFace.TxError>();
  face.once("txerror", (error) => txErrorP.resolve(error));

  const signFn = jest.fn(async (input: Uint8Array) => {
    throw new Error("mock-signing-error");
  });
  const interest = new Interest("/A");
  interest.sigInfo = new ISigInfo();
  interest.sigInfo.type = SigType.Sha256;
  interest[LLSign.PENDING] = signFn;
  face.sendInterest(interest);

  await delay(5);
  expect(signFn).toHaveBeenCalledTimes(1);
  expect(txRemote.data).toHaveLength(0);

  const txError = await txErrorP.promise;
  expect(txError.toString()).toMatch(/\/A/);
});
