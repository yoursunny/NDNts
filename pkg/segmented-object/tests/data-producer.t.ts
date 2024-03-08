import "@ndn/util/test-fixture/expect";

import { consume } from "@ndn/endpoint";
import { Segment } from "@ndn/naming-convention2";
import { Data, Interest, Name } from "@ndn/packet";
import { DataTape } from "@ndn/repo-api";
import { delay } from "@ndn/util";
import { DuplexMock } from "stream-mock";
import { collect } from "streaming-iterables";
import { expect, test } from "vitest";

import { BufferChunkSource, DataProducer, IterableChunkSource, serve } from "..";
import { makeObjectBody } from "../test-fixture/object-body";

const objectBody = makeObjectBody();

test("listData", async () => {
  const src = new BufferChunkSource(objectBody);
  const packets = await collect(DataProducer.listData(src, new Name("/R")));
  expect(Buffer.concat(packets.map((data) => data.content))).toEqualUint8Array(objectBody);
});

test("DataTape insert", { timeout: 10000 }, async () => {
  const src = new BufferChunkSource(objectBody);
  const list = DataProducer.listData(src, new Name("/R"));

  const stream = new DuplexMock();
  const tape = new DataTape(() => stream);
  await tape.insert(list);

  const packets = await collect(tape.listData());
  packets.sort((a, b) => a.name.compare(b.name));
  expect(Buffer.concat(packets.map((data) => data.content))).toEqualUint8Array(objectBody);
});

test("bufferBehind bufferAhead", async () => {
  let offset = 0;
  const src = new IterableChunkSource((async function*() {
    for (offset = 0; offset < 10000; offset += 100) {
      yield objectBody.subarray(offset, offset + 100);
      await delay(10);
    }
  })(), { chunkSize: 100 });

  const prefix = new Name("/R");
  const server = serve(prefix, src, {
    bufferBehind: 10,
    bufferAhead: 2,
  });

  const retrieveSegment = (segmentNum: number) => consume(
    new Interest(prefix.append(Segment, segmentNum), Interest.Lifetime(500)));

  await expect(retrieveSegment(19)).resolves.toBeInstanceOf(Data);
  await delay(200);
  expect(offset).toBe(2200);

  await expect(retrieveSegment(10)).resolves.toBeInstanceOf(Data);
  await expect(retrieveSegment(9)).rejects.toThrow();

  await Promise.all([
    expect(retrieveSegment(29)).resolves.toBeInstanceOf(Data),
    expect(retrieveSegment(27)).resolves.toBeInstanceOf(Data),
  ]);
  await delay(200);
  expect(offset).toBe(3200);

  await expect(retrieveSegment(20)).resolves.toBeInstanceOf(Data);
  await expect(retrieveSegment(19)).rejects.toThrow();

  server.close();
});
