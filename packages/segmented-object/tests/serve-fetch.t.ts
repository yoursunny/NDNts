import "@ndn/tlv/test-fixture/expect";

import { Endpoint } from "@ndn/endpoint";
import { Forwarder } from "@ndn/fw";
import { Segment as Segment1 } from "@ndn/naming-convention1";
import { Segment as Segment2 } from "@ndn/naming-convention2";
import { Interest, Name } from "@ndn/packet";
import { AbortController } from "abort-controller";
import { BufferReadableMock, BufferWritableMock } from "stream-mock";
import { consume } from "streaming-iterables";

import { BufferChunkSource, fetch, IterableChunkSource, makeChunkSource, serve } from "..";

let objectBody: Buffer;

beforeAll(() => {
  objectBody = Buffer.alloc(1024 * 1024);
  for (let i = 0; i < objectBody.length; ++i) {
    objectBody[i] = Math.random() * 0x100;
  }
});
beforeEach(() => Forwarder.getDefault().pit.dataNoTokenMatch = false);
afterEach(() => Forwarder.deleteDefault());

test("buffer to buffer", async () => {
  const server = serve("/R", new BufferChunkSource(objectBody));
  const fetched = fetch.promise(new Name("/R"));
  await expect(fetched).resolves.toEqualUint8Array(objectBody);
  server.close();
});

test("buffer to chunks", async () => {
  const server = serve("/R", makeChunkSource(objectBody));
  const chunks = [] as Uint8Array[];
  for await (const chunk of fetch(new Name("/R"))) {
    chunks.push(chunk);
  }
  expect(Buffer.concat(chunks)).toEqualUint8Array(objectBody);
  server.close();
});

test("stream to stream", async () => {
  const src = new BufferReadableMock([objectBody]);
  const server = serve("/R", makeChunkSource(src));

  const dst = new BufferWritableMock();
  await fetch.toStream(new Name("/R"), dst);

  await new Promise((r) => dst.end(r));
  expect(objectBody.compare(dst.flatData)).toEqual(0);
  server.close();
});

test("iterable to unordered", async () => {
  const server = serve("/R", makeChunkSource((async function*() {
    const yieldSize = 5000;
    for (let i = 0; i < objectBody.length; i += yieldSize) {
      yield objectBody.subarray(i, i + yieldSize);
    }
  })(), {
    chunkSize: 6000,
  }));

  let totalLength = 0;
  const receivedSegments = new Set<number>();
  for await (const data of fetch.unordered(new Name("/R"))) {
    const segNum = data.name.at(-1).as(Segment2);
    expect(receivedSegments.has(segNum)).toBeFalsy();
    receivedSegments.add(segNum);
    expect(data.content.length).toBeLessThanOrEqual(6000);
    totalLength += data.content.length;
  }
  expect(totalLength).toBe(objectBody.length);
  server.close();
});

test("ranged", async () => {
  const server = serve(new Name("/R"), new BufferChunkSource(objectBody, { chunkSize: 1024 })); // 1024 segments
  await Promise.all([
    expect(fetch.promise(new Name("/R"), { segmentRange: [0, 8] }))
      .resolves.toEqualUint8Array(objectBody.subarray(0, 8 * 1024)),
    expect(fetch.promise(new Name("/R"), { segmentRange: [8, 24] }))
      .resolves.toEqualUint8Array(objectBody.subarray(8 * 1024, 24 * 1024)),
    expect(fetch.promise(new Name("/R"), { segmentRange: [1022, undefined] }))
      .resolves.toEqualUint8Array(objectBody.subarray(1022 * 1024)),
    expect(fetch.promise(new Name("/R"), { segmentRange: [1022, 1050] }))
      .resolves.toEqualUint8Array(objectBody.subarray(1022 * 1024)),
    expect(fetch.promise(new Name("/R"), { segmentRange: [1050, undefined], retxLimit: 1 }))
      .rejects.toThrow(),
  ]);
  server.close();
});

test("empty object", async () => {
  const fw = Forwarder.create();
  const server = serve("/R", new BufferChunkSource(new Uint8Array()), { endpoint: new Endpoint({ fw }), segmentNumConvention: Segment1 });

  const ep = new Endpoint({ fw });
  await expect(ep.consume(new Interest(new Name("/R").append(Segment1, 1), Interest.Lifetime(50))))
    .rejects.toThrow();
  const data = await ep.consume(new Interest(new Name("/R").append(Segment1, 0)));
  expect(data.content).toHaveLength(0);

  server.close();
});

test("segment number convention mismatch", async () => {
  const server = serve("/R", new BufferChunkSource(objectBody), { segmentNumConvention: Segment1 });
  await expect(fetch.promise(new Name("/R"), { retxLimit: 1 })).rejects.toThrow();
  server.close();
});

test("abort", async () => {
  const src = (async function*() {
    const yieldSize = 8 * 1024;
    for (let i = 0; i < objectBody.length; i += yieldSize) {
      yield objectBody.subarray(i, i + yieldSize);
      await new Promise((r) => setTimeout(r, 100));
    }
  })();
  const server = serve("/R", new IterableChunkSource(src));

  const abort = new AbortController();
  const cancelable = fetch.promise(new Name("/R"));
  await Promise.all([
    (async () => {
      await new Promise((r) => setTimeout(r, 150));
      abort.abort();
      cancelable.cancel();
    })(),
    expect(cancelable).rejects.toThrow(),
    expect(fetch.promise(new Name("/R"), { abort })).rejects.toThrow(),
    expect(consume(fetch(new Name("/R"), { abort }))).rejects.toThrow(),
    expect(consume(fetch.packets(new Name("/R"), { abort }))).rejects.toThrow(),
    expect(consume(fetch.unordered(new Name("/R"), { abort }))).rejects.toThrow(),
  ]);

  server.close();
});
