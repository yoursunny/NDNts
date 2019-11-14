import { Interest, LLSign, SigInfo, SigType } from "@ndn/l3pkt";
import { ObjectReadableMock, ObjectWritableMock } from "stream-mock";
import { consume } from "streaming-iterables";

import { DatagramTransport, L3Face } from "..";
import { makeDuplex } from "../test-fixture/pair";

describe("name", () => {
  test("unspecified", () => {
    const transport = new DatagramTransport(makeDuplex(undefined, undefined));
    const face = new L3Face(transport);
    expect(transport.toString()).toBe("DatagramTransport");
    expect(face.toString()).toBe("L3Face(DatagramTransport)");
  });

  test("specified at transport", () => {
    const transport = new DatagramTransport(makeDuplex(undefined, undefined), { describe: "tname" });
    const face = new L3Face(transport);
    expect(transport.toString()).toBe("tname");
    expect(face.toString()).toBe("tname");
  });

  test("specified at face", () => {
    const transport = new DatagramTransport(makeDuplex(undefined, undefined), { describe: "tname" });
    const face = new L3Face(transport, { describe: "fname" });
    expect(transport.toString()).toBe("tname");
    expect(face.toString()).toBe("fname");
  });
});

test("RX error on unknown TLV-TYPE", async () => {
  const rxRemote = new ObjectReadableMock([
    Buffer.from([0xF0, 0x00]),
  ]);
  const face = new L3Face(new DatagramTransport(makeDuplex(rxRemote, undefined)));
  const rxErrorP = new Promise<L3Face.RxError>((r) => face.once("rxerror", r));

  await Promise.all([
    consume(face.rx),
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    face.tx((async function*() {})()),
    expect(rxErrorP).resolves.toThrow(/F000/),
  ]);
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
