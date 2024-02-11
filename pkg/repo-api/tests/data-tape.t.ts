import "@ndn/packet/test-fixture/expect";

import { MockTransport } from "@ndn/l3face/test-fixture/mock-transport";
import { BufferBreaker } from "@ndn/node-transport/test-fixture/buffer-breaker";
import { Data, Interest, Name } from "@ndn/packet";
import { Encoder } from "@ndn/tlv";
import { delay, randomJitter } from "@ndn/util";
import { makeTmpDir } from "@ndn/util/test-fixture/tmp";
import { BufferReadableMock, BufferWritableMock } from "stream-mock";
import { collect } from "streaming-iterables";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { BulkInsertInitiator, BulkInsertTarget, copy, DataTape } from "..";

function makeDataTapeReadStream(mode: DataTape.StreamMode): NodeJS.ReadableStream {
  expect(mode).toBe("read");
  return new BufferReadableMock((function*() {
    for (let i = 0; i < 500; ++i) {
      yield Encoder.encode(new Data(`/A/${Math.trunc(i / 100)}/${i % 100}`));
    }
  })()).pipe(new BufferBreaker());
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
  beforeEach(async () => {
    tape = new DataTape(makeDataTapeReadStream);
    await delay(200);
  });

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

test("DataTape file copy", async () => {
  using tmpDir = makeTmpDir();

  const tapeA = new DataTape(tmpDir.join("A.dtar"));
  await copy(new DataTape(makeDataTapeReadStream), tapeA);
  await expect(collect(tapeA.listNames())).resolves.toHaveLength(500);

  const tapeB = new DataTape(tmpDir.join("B.dtar"));
  await copy(tapeA, new Name("/A/2"), tapeB);
  await expect(collect(tapeB.listNames())).resolves.toHaveLength(100);
});

async function testBulkInsertTarget(
    stream: NodeJS.WritableStream | DataTape.OpenStream,
    retrieve: () => Buffer,
) {
  const tape = new DataTape(stream);
  const storeInsert = vi.spyOn(tape, "insert");

  const bi = BulkInsertTarget.create<{}>(tape, {
    batch: 32,
    parallel: 8,
  });
  await bi.accept(makeDataTapeReadStream("read"));
  expect(storeInsert).toHaveBeenCalledTimes(16);

  await tape[Symbol.asyncDispose]();
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
  const tr = new MockTransport();
  const bi = new BulkInsertInitiator(tr);
  bi.addEventListener("error", (evt) => {
    expect.fail(`unexpected error event ${evt.detail}`);
  });
  let n = 0;
  const interval = randomJitter(0.5, 10);
  for (let i = 0; i < 10; ++i) {
    await delay(interval());
    const pkts = Array.from(
      { length: Math.trunc(Math.random() * 64) },
      () => new Data(`/D/${++n}`), // eslint-disable-line @typescript-eslint/no-loop-func
    );
    await bi.insert(...pkts);
  }
  await bi[Symbol.asyncDispose]();
  expect(tr.sent).toHaveLength(n);
});
