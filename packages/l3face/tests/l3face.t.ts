import { Interest, LLSign, SigInfo, SigType } from "@ndn/l3pkt";
import { ObjectReadableMock, ObjectWritableMock } from "stream-mock";
import { consume } from "streaming-iterables";

import { DatagramTransport, L3Face } from "../src";
import { makeDuplex } from "../test-fixture/pair";

test("name unspecified", () => {
  const stream = makeDuplex(undefined, undefined);
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  stream.constructor = function faceName() {};
  const face = new L3Face(new DatagramTransport(stream));
  expect(face.toString()).toBe("faceName");
});

test("name specified", () => {
  const face = new L3Face(new DatagramTransport(makeDuplex(undefined, undefined), "face-name"));
  expect(face.toString()).toBe("face-name");
});

test("RX error on unknown TLV-TYPE", async () => {
  const rxRemote = new ObjectReadableMock([
    Buffer.from([0xF0, 0x00]),
  ]);
  const face = new L3Face(new DatagramTransport(makeDuplex(rxRemote, undefined)));
  const rxErrorP = new Promise<L3Face.RxError>((r) => face.once("rxerror", (err) => r(err)));

  await consume(face.rx);
  await expect(rxErrorP).resolves.toThrow(/F000/);
});

test("TX signing", async () => {
  const txRemote = new ObjectWritableMock();
  const face = new L3Face(new DatagramTransport(makeDuplex(undefined, txRemote)));

  const signFn = jest.fn(async (input: Uint8Array) => {
    return Uint8Array.of(0xA0, 0xA1, 0xA2, 0xA3);
  });
  const interest = new Interest("/A");
  interest.sigInfo = new SigInfo(SigType.Sha256);
  interest[LLSign.PENDING] = signFn;
  await face.tx({
    async *[Symbol.asyncIterator]() {
      yield interest;
    },
  });

  await new Promise((r) => setTimeout(r, 5));
  expect(signFn).toHaveBeenCalledTimes(1);
  expect(txRemote.data).toHaveLength(1);
  expect(Array.from(txRemote.data[0])).toEqual(expect.arrayContaining([0xA0, 0xA1, 0xA2, 0xA3]));
});

test("TX signing error", async () => {
  const txRemote = new ObjectWritableMock();
  const face = new L3Face(new DatagramTransport(makeDuplex(undefined, txRemote)));
  const txErrorP = new Promise<L3Face.TxError>((r) => face.once("txerror", r));

  const signFn = jest.fn(async (input: Uint8Array) => {
    throw new Error("mock-signing-error");
  });
  const interest = new Interest("/A");
  interest.sigInfo = new SigInfo(SigType.Sha256);
  interest[LLSign.PENDING] = signFn;
  await face.tx({
    async *[Symbol.asyncIterator]() {
      yield interest;
    },
  });

  await new Promise((r) => setTimeout(r, 5));
  expect(signFn).toHaveBeenCalledTimes(1);
  expect(txRemote.data).toHaveLength(0);

  const txError = await txErrorP;
  expect(txError.toString()).toMatch(/\/A/);
});
