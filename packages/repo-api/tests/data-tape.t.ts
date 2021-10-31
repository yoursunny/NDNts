import "@ndn/packet/test-fixture/expect";

import { L3Face } from "@ndn/l3face";
import { MockTransport } from "@ndn/l3face/test-fixture/mock-transport";
import { BufferBreaker } from "@ndn/node-transport/test-fixture/buffer-breaker";
import { Data, Interest, Name } from "@ndn/packet";
import { Encoder } from "@ndn/tlv";
import fs from "graceful-fs";
import { setTimeout as delay } from "node:timers/promises";
import { BufferReadableMock, BufferWritableMock } from "stream-mock";
import { collect, map, pipeline, writeToStream } from "streaming-iterables";
import { tmpNameSync } from "tmp";

import { BulkInsertInitiator, BulkInsertTarget, copy, DataTape } from "..";

function makeDataTapeReadStream(mode: DataTape.StreamMode): NodeJS.ReadableStream {
  expect(mode).toBe("read");
  const bb = new BufferBreaker();
  void (async () => {
    try {
      await pipeline(
        async function*() {
          for (let i = 0; i < 500; ++i) {
            yield new Data(`/A/${Math.floor(i / 100)}/${i % 100}`);
            if (i % 20 === 0) {
              await delay(Math.random() * 5);
            }
          }
        },
        map((data) => Encoder.encode(data)),
        writeToStream(bb),
      );
    } catch {} finally { bb.end(); }
  })();
  return bb;
}

function makeDataTapeAppendStream(): [open: DataTape.OpenStream, retrieve: () => Buffer] {
  const all: Buffer[] = [];
  return [
    (mode: DataTape.StreamMode) => {
      expect(mode).toBe("append");
      const stream = new BufferWritableMock();
      stream.on("finish", () => all.push(stream.flatData));
      return stream;
    },
    () => Buffer.concat(all),
  ];
}

describe("DataTape reader", () => {
  let tape: DataTape;
  beforeEach(() => tape = new DataTape(makeDataTapeReadStream));

  test("listNames", async () => {
    const names = await collect(tape.listNames());
    expect(names).toHaveLength(500);
  });

  test("listNames filtered", async () => {
    const names = await collect(tape.listNames(new Name("/A/2")));
    expect(names).toHaveLength(100);
  });

  test("listData", async () => {
    const pkts = await collect(tape.listData());
    expect(pkts).toHaveLength(500);
  });

  test("get", async () => {
    await expect(tape.get(new Name("/A/0/1"))).resolves.toBeInstanceOf(Data);
    await expect(tape.get(new Name("/Z"))).resolves.toBeUndefined();
    await expect(tape.find(new Interest("/A/0"))).resolves.toBeUndefined();
    await expect(tape.find(new Interest("/A/0", Interest.CanBePrefix))).resolves.toBeInstanceOf(Data);
  });
});

describe("DataTape file", () => {
  let filenameA: string;
  let filenameB: string;
  beforeEach(() => {
    filenameA = tmpNameSync();
    filenameB = tmpNameSync();
  });
  afterEach(() => {
    try { fs.unlinkSync(filenameA); } catch {}
    try { fs.unlinkSync(filenameB); } catch {}
  });

  test("copy", async () => {
    const tapeA = new DataTape(filenameA);
    await copy(new DataTape(makeDataTapeReadStream), tapeA);
    await expect(collect(tapeA.listNames())).resolves.toHaveLength(500);

    const tapeB = new DataTape(filenameB);
    await copy(tapeA, new Name("/A/2"), tapeB);
    await expect(collect(tapeB.listNames())).resolves.toHaveLength(100);
  });
});

async function testBulkInsertTarget(
    stream: NodeJS.WritableStream | DataTape.OpenStream,
    retrieve: () => Buffer,
) {
  const tape = new DataTape(stream);
  const storeInsert = jest.spyOn(tape, "insert");

  const bi = BulkInsertTarget.create<{}>(tape, {
    batch: 32,
    parallel: 8,
  });
  await bi.accept(makeDataTapeReadStream("read"));
  expect(storeInsert).toHaveBeenCalledTimes(16);

  await tape.close();
  const readback = new DataTape(new BufferReadableMock(retrieve()));
  await expect(collect(readback.listData())).resolves.toHaveLength(500);
}

test("BulkInsertTarget single-stream", () => {
  const [open, retrieve] = makeDataTapeAppendStream();
  return testBulkInsertTarget(open("append") as NodeJS.WritableStream, retrieve);
});

test("BulkInsertTarget make-stream", () => {
  const [open, retrieve] = makeDataTapeAppendStream();
  return testBulkInsertTarget(open, retrieve);
});

test("BulkInsertInitiator", async () => {
  const transport = new MockTransport();
  const bi = new BulkInsertInitiator(new L3Face(transport));
  let n = 0;
  for (let i = 0; i < 10; ++i) {
    await delay(Math.random() * 20);
    const pkts: Data[] = [];
    const count = Math.floor(Math.random() * 64);
    for (let j = 0; j < count; ++j) {
      pkts.push(new Data(`/D/${++n}`));
    }
    await bi.insert(...pkts);
  }
  await bi.close();
  expect(transport.sent).toHaveLength(n);
});
