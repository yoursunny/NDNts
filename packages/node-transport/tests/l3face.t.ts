import { L3Face } from "@ndn/l3face";
import { Data, Interest, LLSign, SigInfo, SigType } from "@ndn/l3pkt";
import * as net from "net";
import { pipeline as pipeline_ } from "readable-stream";
import { BufferWritableMock } from "stream-mock";
import { collect } from "streaming-iterables";
import { promisify } from "util";

import { UnixTransport } from "..";
import * as NetServerTest from "../test-fixture/net-server";

const pipeline = promisify(pipeline_);

let sock: net.Socket;
let transport: UnixTransport;
let face: L3Face;

beforeEach(async () => {
  await NetServerTest.createIpcServer();
  [transport, [sock]] = await Promise.all([
    UnixTransport.connect(NetServerTest.ipcPath),
    NetServerTest.waitNClients(1),
  ]);
  face = new L3Face(transport);
});

afterEach(NetServerTest.destroyServer);

test("RX error", async () => {
  setTimeout(() => sock.write(Uint8Array.of(0xF0, 0x00)), 200);
  await Promise.all([
    expect(collect(face.rx)).resolves.toHaveLength(0),
    // eslint-disable-next-line require-yield
    face.tx((async function*() {
      await new Promise((r) => setTimeout(r, 400));
    })()),
    expect(new Promise((r) => face.once("rxerror", r))).resolves.toThrow(/F000/),
  ]);
});

test("TX signing", async () => {
  const signOk = jest.fn(async (input: Uint8Array) => {
    return Uint8Array.of(0xA0, 0xA1, 0xA2, 0xA3);
  });
  const signFail = jest.fn(async (input: Uint8Array) => {
    throw new Error("mock-signing-error");
  });
  const sent = new BufferWritableMock();

  await Promise.all([
    face.tx((async function*() {
      const interest = new Interest("/A");
      interest.sigInfo = new SigInfo(SigType.Sha256);
      interest[LLSign.PENDING] = signOk;
      yield interest;
      await new Promise((r) => setTimeout(r, 5));

      const data = new Data("/A");
      data.sigInfo = new SigInfo(SigType.Sha256);
      data[LLSign.PENDING] = signFail;
      yield data;
      await new Promise((r) => setTimeout(r, 5));
    })()),
    pipeline(sock, sent),
    expect(new Promise((resolve, reject) => face.once("txerror", reject)))
      .rejects.toThrow(/\/A/),
  ]);

  expect(signOk).toHaveBeenCalledTimes(1);
  expect(Array.from(sent.flatData)).toEqual(expect.arrayContaining([0xA0, 0xA1, 0xA2, 0xA3]));
});
