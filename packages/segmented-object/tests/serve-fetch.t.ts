import "@ndn/util/test-fixture/expect";

// eslint-disable-next-line n/no-unsupported-features/node-builtins
import { Blob } from "node:buffer";

import { Endpoint, type ProducerHandler } from "@ndn/endpoint";
import { Forwarder } from "@ndn/fw";
import { Bridge } from "@ndn/l3face/test-fixture/bridge";
import { Segment2, Segment3 } from "@ndn/naming-convention2";
import { Data, Name, type Verifier } from "@ndn/packet";
import { Closers, delay } from "@ndn/util";
import { deleteTmpFiles, writeTmpFile } from "@ndn/util/test-fixture/tmpfile";
import { BufferReadableMock, BufferWritableMock } from "stream-mock";
import { collect, consume } from "streaming-iterables";
import { afterEach, beforeAll, beforeEach, describe, expect, test, vi } from "vitest";

import { BlobChunkSource, BufferChunkSource, fetch, FileChunkSource, IterableChunkSource, makeChunkSource, serve, StreamChunkSource } from "..";
import { makeObjectBody } from "../test-fixture/object-body";

const closers = new Closers();
const objectBody = makeObjectBody();
beforeEach(() => Forwarder.replaceDefault(Forwarder.create({ dataNoTokenMatch: false })));
afterEach(() => {
  closers.close();
  Forwarder.deleteDefault();
});

test("buffer to buffer", async () => {
  const chunkSource = makeChunkSource(objectBody);
  expect(chunkSource).toBeInstanceOf(BufferChunkSource);
  const server = serve("/R", chunkSource);
  closers.push(server);

  const fetched = fetch("/R");
  expect(fetched.count).toBe(0);
  await expect(fetched).resolves.toEqualUint8Array(objectBody);
  expect(fetched.count).toBeGreaterThan(0);
});

test("blob to chunks", async () => {
  const chunkSource = makeChunkSource(new Blob([objectBody]));
  expect(chunkSource).toBeInstanceOf(BlobChunkSource);
  const server = serve("/R", chunkSource);
  closers.push(server);

  const fetched = fetch("/R");
  const chunks = await collect(fetched.chunks());
  expect(fetched.count).toBe(chunks.length);
  expect(Buffer.concat(chunks)).toEqualUint8Array(objectBody);
});

test("stream to stream", async () => {
  const src = new BufferReadableMock([objectBody]);
  const chunkSource = makeChunkSource(src);
  expect(chunkSource).toBeInstanceOf(StreamChunkSource);
  const server = serve("/R", chunkSource);
  closers.push(server);

  const dst = new BufferWritableMock();
  await fetch("/R").pipe(dst);

  await new Promise((r) => dst.end(r));
  expect(objectBody.compare(dst.flatData)).toEqual(0);
});

describe("file source", () => {
  let filename: string;
  beforeAll(() => {
    filename = writeTmpFile(objectBody);
    return deleteTmpFiles;
  });

  test("file to buffer", async () => {
    const server = serve("/R", new FileChunkSource(filename));
    closers.push(server);

    const fetched = fetch("/R");
    await expect(fetched).resolves.toEqualUint8Array(objectBody);
  });
});

test("iterable to unordered", async () => {
  const chunkSource = makeChunkSource((async function*() {
    const yieldSizes = [5000, 7000, 20000];
    let i = -1;
    for (let offset = 0; offset < objectBody.length;) {
      const end = offset + yieldSizes[++i % yieldSizes.length]!;
      yield objectBody.subarray(offset, end);
      offset = end;
    }
  })(), {
    chunkSize: 6000,
  });
  expect(chunkSource).toBeInstanceOf(IterableChunkSource);
  const server = serve("/R", chunkSource);
  closers.push(server);

  let totalLength = 0;
  const receivedSegments = new Set<number>();
  const fetched = fetch("/R");
  for await (const data of fetched.unordered()) {
    expect(data.segNum).toBe(data.name.at(-1).as(Segment3));
    expect(receivedSegments.has(data.segNum)).toBeFalsy();
    receivedSegments.add(data.segNum);
    expect(data.content.length).toBeLessThanOrEqual(6000);
    totalLength += data.content.length;
    expect(fetched.count).toBe(receivedSegments.size);
  }
  expect(totalLength).toBe(objectBody.length);
});

test("ranged", async () => {
  const chunkSource = makeChunkSource(objectBody, { chunkSize: 1024 }); // 1024 segments
  expect(chunkSource).toBeInstanceOf(BufferChunkSource);
  const server = serve(new Name("/R"), chunkSource);
  closers.push(server);

  await Promise.all([
    expect(fetch("/R", { segmentRange: [0, 8] }))
      .resolves.toEqualUint8Array(objectBody.subarray(0, 8 * 1024)),
    expect(fetch("/R", { segmentRange: [8, 24] }))
      .resolves.toEqualUint8Array(objectBody.subarray(8 * 1024, 24 * 1024)),
    expect(fetch("/R", { segmentRange: [1022, undefined] }))
      .resolves.toEqualUint8Array(objectBody.subarray(1022 * 1024)),
    expect(fetch("/R", { segmentRange: [1022, Infinity] }))
      .resolves.toEqualUint8Array(objectBody.subarray(1022 * 1024)),
    expect(fetch("/R", { segmentRange: [1022, 1050] }))
      .resolves.toEqualUint8Array(objectBody.subarray(1022 * 1024)),
    expect(fetch("/R", { segmentRange: [1050, undefined], retxLimit: 1 }))
      .rejects.toThrow(),
  ]);
});

describe("empty object", () => {
  const handler1 = vi.fn<Parameters<ProducerHandler>, ReturnType<ProducerHandler>>(
    async (interest) => new Data(interest.name, Data.ContentType(3)));
  beforeEach(() => {
    handler1.mockReset();
    const server = serve("/R", new BufferChunkSource(new Uint8Array()));
    const producer1 = new Endpoint().produce(server.prefix.append(Segment3, 1), handler1);
    closers.push(server, producer1);
  });

  test("consume single", async () => {
    const ep = new Endpoint({ modifyInterest: { lifetime: 50 } });
    await expect(ep.consume(new Name("/R").append(Segment3, 2)))
      .rejects.toThrow();
    const data = await ep.consume(new Name("/R").append(Segment3, 0));
    expect(data.content).toHaveLength(0);
  });

  test("fetch", async () => {
    const fetched = fetch("/R");
    await expect(fetched).resolves.toHaveLength(0);
    expect(fetched.count).toBe(1);
    expect(handler1).toHaveBeenCalled();
  });

  test("verify error", async () => {
    const verify = vi.fn<Parameters<Verifier["verify"]>, ReturnType<Verifier["verify"]>>()
      .mockRejectedValue(new Error("mock-verify-error"));
    await expect(fetch("/R", { verifier: { verify }, retxLimit: 0 }))
      .rejects.toThrow(/mock-verify-error/);
    expect(verify).toHaveBeenCalledTimes(1);
  });
});

test("segment number convention mismatch", async () => {
  const server = serve("/R", new BufferChunkSource(objectBody), { segmentNumConvention: Segment2 });
  closers.push(server);

  await expect(fetch("/R", { retxLimit: 1 })).rejects.toThrow();
});

test("abort", async () => {
  const src = (async function*() {
    const yieldSize = 8 * 1024;
    for (let i = 0; i < objectBody.length; i += yieldSize) {
      yield objectBody.subarray(i, i + yieldSize);
      await delay(100);
    }
  })();
  const server = serve("/R", new IterableChunkSource(src));
  closers.push(server);

  const abort = new AbortController();
  const { signal } = abort;
  await Promise.all([
    (async () => {
      await delay(150);
      abort.abort();
    })(),
    expect(fetch("/R", { signal })).rejects.toThrow(),
    expect(consume(fetch("/R", { signal }))).rejects.toThrow(),
    expect(consume(fetch("/R", { signal }).chunks())).rejects.toThrow(),
    expect(consume(fetch("/R", { signal }).unordered())).rejects.toThrow(),
  ]);
});

test("congestion avoidance", async () => {
  const fw = Forwarder.create();
  const server = serve("/R", new BufferChunkSource(objectBody), { endpoint: new Endpoint({ fw }) });
  closers.push(server);

  const relay: Bridge.RelayOptions = {
    minDelay: 10,
    maxDelay: 90,
    loss: 0.02,
  };
  const bridge = Bridge.create({
    fwA: Forwarder.getDefault(),
    fwB: fw,
    relayAB: relay,
    relayBA: relay,
  });
  closers.push(bridge);

  const fetched = fetch("/R");
  await expect(fetched).resolves.toEqualUint8Array(objectBody);
}, 15000);
