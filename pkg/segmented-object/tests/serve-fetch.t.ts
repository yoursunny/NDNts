import "@ndn/util/test-fixture/expect";

import { Blob } from "node:buffer";
import path from "node:path";

import { consume } from "@ndn/endpoint";
import { Forwarder } from "@ndn/fw";
import { SnapshotFaces } from "@ndn/fw/test-fixture/snapshot-faces";
import { Bridge } from "@ndn/l3face";
import { Segment2, Segment3 } from "@ndn/naming-convention2";
import { FwHint, Name, type Verifier } from "@ndn/packet";
import { Closers, delay } from "@ndn/util";
import { makeTmpDir } from "@ndn/util/test-fixture/tmp";
import { promises as zenfs } from "@zenfs/core";
import { BufferReadableMock, BufferWritableMock } from "stream-mock";
import { collect, consume as consumeIterable } from "streaming-iterables";
import { afterEach, beforeAll, beforeEach, describe, expect, test, vi } from "vitest";

import { BlobChunkSource, BufferChunkSource, fetch, FileChunkSource, IterableChunkSource, serve, StreamChunkSource } from "..";
import { makeObjectBody } from "../test-fixture/object-body";

const fwOpts: Forwarder.Options = { dataNoTokenMatch: false };
let sFaces: SnapshotFaces;
const closers = new Closers();
const objectBody = makeObjectBody();
const zenfsFilename = "/serve-fetch-test/1.bin";
beforeAll(async () => {
  await zenfs.mkdir(path.dirname(zenfsFilename));
  await zenfs.writeFile(zenfsFilename, objectBody);
});
beforeEach(() => {
  Forwarder.replaceDefault(Forwarder.create(fwOpts));
  sFaces = new SnapshotFaces();
});
afterEach(async () => {
  closers.close();
  await delay(1);
  sFaces.expectSameFaces();
  Forwarder.deleteDefault();
});

async function* generateChunksSlowly() {
  const yieldSize = 8 * 1024;
  for (let i = 0; i < objectBody.length; i += yieldSize) {
    yield objectBody.subarray(i, i + yieldSize);
    await delay(100);
  }
}

test("buffer to buffer", async () => {
  const chunkSource = new BufferChunkSource(objectBody);
  expect(chunkSource).toBeInstanceOf(BufferChunkSource);
  const server = serve("/R", chunkSource);
  closers.push(server);

  const fetched = fetch("/R");
  expect(fetched.count).toBe(0);
  await expect(fetched).resolves.toEqualUint8Array(objectBody);
  expect(fetched.count).toBeGreaterThan(0);
});

test("blob to chunks", async () => {
  const chunkSource = new BlobChunkSource(new Blob([objectBody]));
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
  const chunkSource = new StreamChunkSource(src);
  expect(chunkSource).toBeInstanceOf(StreamChunkSource);
  const server = serve("/R", chunkSource);
  closers.push(server);

  const dst = new BufferWritableMock();
  await fetch("/R").pipe(dst);

  await new Promise((resolve) => dst.end(resolve));
  expect(objectBody.compare(dst.flatData)).toEqual(0);
});

describe("file source", () => {
  let filename: string;
  beforeAll(() => {
    const tmpDir = makeTmpDir();
    filename = tmpDir.createFile(objectBody);
    return tmpDir[Symbol.dispose];
  });

  test("file to buffer", async () => {
    const server = serve("/R", new FileChunkSource(filename));
    closers.push(server);

    const fetched = fetch("/R");
    await expect(fetched).resolves.toEqualUint8Array(objectBody);
  });
});

test("zenfs to buffer", async () => {
  const server = serve("/R", new FileChunkSource(zenfsFilename, { zenfs: true }));
  closers.push(server);

  const fetched = fetch("/R");
  await expect(fetched).resolves.toEqualUint8Array(objectBody);
});

test("iterable to unordered", async () => {
  const chunkSource = new IterableChunkSource((async function*() {
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
  const chunkSource = new BufferChunkSource(objectBody, { chunkSize: 1024 }); // 1024 segments
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

test.each<(fw: Forwarder, fwHint: FwHint) => fetch.Options>([
  (fw, fwHint) => ({ fw, modifyInterest: { fwHint } }),
  (fw, fwHint) => ({ cOpts: { fw, modifyInterest: { fwHint } } }),
])("modifyInterest %#", async (makeOpts) => {
  using bridge = Bridge.create({
    fwOpts,
    routesAB: [],
    routesBA: ["/S"],
  }).rename("S", "F");
  bridge.fwS.nodeNames.push(new Name("/S"));
  const server = serve("/R", new BufferChunkSource(objectBody), {
    pOpts: { fw: bridge.fwS },
  });
  closers.push(server);

  await expect(fetch("/R", makeOpts(bridge.fwF, new FwHint("/S")))).resolves.toEqualUint8Array(objectBody);
});

describe("empty object", () => {
  beforeEach(() => {
    const server = serve("/R", new BufferChunkSource(new Uint8Array()));
    closers.push(server);
  });

  test("consume single", async () => {
    await expect(consume(new Name("/R").append(Segment3, 2), { modifyInterest: { lifetime: 50 } }))
      .rejects.toThrow();
    const data = await consume(new Name("/R").append(Segment3, 0));
    expect(data.content).toHaveLength(0);
  });

  test("fetch", async () => {
    const fetched = fetch("/R");
    await expect(fetched).resolves.toHaveLength(0);
    expect(fetched.count).toBe(1);
  });

  test.each<(verifier: Verifier) => fetch.Options>([
    (verifier) => ({ verifier }),
    (verifier) => ({ cOpts: { verifier } }),
  ])("verify error %#", async (makeOpts) => {
    const verify = vi.fn<Verifier["verify"]>().mockRejectedValue(new Error("mock-verify-error"));
    await expect(fetch("/R", { retxLimit: 0, ...makeOpts({ verify }) }))
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
  const server = serve("/R", new IterableChunkSource(generateChunksSlowly()));
  closers.push(server);

  const signal = AbortSignal.timeout(200);
  const t0 = Date.now();
  await Promise.all([
    expect(fetch("/R", { signal })).rejects.toThrow(/aborted/),
    expect(fetch("/R", { cOpts: { signal } })).rejects.toThrow(/aborted/),
    expect(consumeIterable(fetch("/R", { signal }))).rejects.toThrow(/aborted/),
    expect(consumeIterable(fetch("/R", { signal }).chunks())).rejects.toThrow(/aborted/),
    expect(consumeIterable(fetch("/R", { signal }).unordered())).rejects.toThrow(/aborted/),
  ]);
  expect(Date.now() - t0).toBeLessThan(400);
});

test("FwFace closing", async () => {
  using bridge = Bridge.create({
    fwB: Forwarder.getDefault(),
  }).rename("S", "F");
  const server = serve("/R", new IterableChunkSource(generateChunksSlowly()), {
    pOpts: { fw: bridge.fwS },
  });
  closers.push(server);

  setTimeout(() => Forwarder.deleteDefault(), 200);
  const t0 = Date.now();
  await Promise.all([
    expect(fetch("/R")).rejects.toThrow(/incomplete/),
    expect(consumeIterable(fetch("/R"))).rejects.toThrow(/incomplete/),
    expect(consumeIterable(fetch("/R").chunks())).rejects.toThrow(/incomplete/),
    expect(consumeIterable(fetch("/R").unordered())).rejects.toThrow(/incomplete/),
  ]);
  expect(Date.now() - t0).toBeLessThan(400);
});

test("congestion avoidance", { timeout: 15000 }, async () => {
  const relay: Bridge.RelayOptions = {
    loss: 0.02,
    delay: 50,
    jitter: 0.8,
  };
  using bridge = Bridge.create({
    fwA: Forwarder.getDefault(),
    fwOpts,
    relayAB: relay,
    relayBA: relay,
  }).rename("F", "S");

  const server = serve("/R", new BufferChunkSource(objectBody), {
    pOpts: { fw: bridge.fwS },
  });
  closers.push(server);

  const fetched = fetch("/R");
  await expect(fetched).resolves.toEqualUint8Array(objectBody);
});
