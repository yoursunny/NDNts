import "@ndn/tlv/test-fixture/expect";

import { Endpoint } from "@ndn/endpoint";
import { Forwarder } from "@ndn/fw";
import { Bridge } from "@ndn/l3face/test-fixture/bridge";
import { Segment as Segment1 } from "@ndn/naming-convention1";
import { Segment as Segment2 } from "@ndn/naming-convention2";
import { Name, Verifier } from "@ndn/packet";
import AbortController from "abort-controller";
import { BufferReadableMock, BufferWritableMock } from "stream-mock";
import { collect, consume } from "streaming-iterables";

import { BufferChunkSource, fetch, FileChunkSource, IterableChunkSource, makeChunkSource, serve, Server } from "..";
import { makeObjectBody } from "../test-fixture/object-body";
import { deleteTmpFiles, writeTmpFile } from "../test-fixture/tmpfile";

const objectBody = makeObjectBody();
beforeEach(() => Forwarder.getDefault().pit.dataNoTokenMatch = false);
afterEach(() => Forwarder.deleteDefault());

test("buffer to buffer", async () => {
  const server = serve("/R", new BufferChunkSource(objectBody));
  const fetched = fetch(new Name("/R"));
  await expect(fetched).resolves.toEqualUint8Array(objectBody);
  server.close();
});

test("buffer to chunks", async () => {
  const server = serve("/R", makeChunkSource(objectBody));
  const chunks = await collect(fetch(new Name("/R")).chunks());
  expect(Buffer.concat(chunks)).toEqualUint8Array(objectBody);
  server.close();
});

test("stream to stream", async () => {
  const src = new BufferReadableMock([objectBody]);
  const server = serve("/R", makeChunkSource(src));

  const dst = new BufferWritableMock();
  await fetch(new Name("/R")).pipe(dst);

  await new Promise((r) => dst.end(r));
  expect(objectBody.compare(dst.flatData)).toEqual(0);
  server.close();
});

describe("file source", () => {
  let filename: string;
  beforeAll(() => filename = writeTmpFile(objectBody));
  afterAll(deleteTmpFiles);

  test("file to buffer", async () => {
    const server = serve("/R", new FileChunkSource(filename));
    const fetched = fetch(new Name("/R"));
    await expect(fetched).resolves.toEqualUint8Array(objectBody);
    server.close();
  });
});

test("iterable to unordered", async () => {
  const server = serve("/R", makeChunkSource((async function*() {
    const yieldSizes = [5000, 7000, 3000];
    let i = -1;
    for (let offset = 0; offset < objectBody.length;) {
      const end = offset + yieldSizes[++i % yieldSizes.length]!;
      yield objectBody.subarray(offset, end);
      offset = end;
    }
  })(), {
    chunkSize: 6000,
  }));

  let totalLength = 0;
  const receivedSegments = new Set<number>();
  for await (const data of fetch(new Name("/R")).unordered()) {
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
    expect(fetch(new Name("/R"), { segmentRange: [0, 8] }))
      .resolves.toEqualUint8Array(objectBody.subarray(0, 8 * 1024)),
    expect(fetch(new Name("/R"), { segmentRange: [8, 24] }))
      .resolves.toEqualUint8Array(objectBody.subarray(8 * 1024, 24 * 1024)),
    expect(fetch(new Name("/R"), { segmentRange: [1022, undefined] }))
      .resolves.toEqualUint8Array(objectBody.subarray(1022 * 1024)),
    expect(fetch(new Name("/R"), { segmentRange: [1022, 1050] }))
      .resolves.toEqualUint8Array(objectBody.subarray(1022 * 1024)),
    expect(fetch(new Name("/R"), { segmentRange: [1050, undefined], retxLimit: 1 }))
      .rejects.toThrow(),
  ]);
  server.close();
});

describe("empty object", () => {
  let server: Server;
  beforeEach(() => {
    server = serve("/R", new BufferChunkSource(new Uint8Array()));
  });
  afterEach(() => {
    server.close();
  });

  test("consume single", async () => {
    const ep = new Endpoint({ modifyInterest: { lifetime: 50 } });
    await expect(ep.consume(new Name("/R").append(Segment2, 1)))
      .rejects.toThrow();
    const data = await ep.consume(new Name("/R").append(Segment2, 0));
    expect(data.content).toHaveLength(0);
  });

  test("fetch", async () => {
    await expect(fetch(new Name("/R"))).resolves.toHaveLength(0);
  });

  test("verify error", async () => {
    const verify = jest.fn<ReturnType<Verifier["verify"]>, Parameters<Verifier["verify"]>>()
      .mockRejectedValue(new Error("mock-verify-error"));
    await expect(fetch(new Name("/R"), { verifier: { verify }, retxLimit: 0 }))
      .rejects.toThrow(/mock-verify-error/);
    expect(verify).toHaveBeenCalledTimes(1);
  });
});

test("segment number convention mismatch", async () => {
  const server = serve("/R", new BufferChunkSource(objectBody), { segmentNumConvention: Segment1 });
  await expect(fetch(new Name("/R"), { retxLimit: 1 })).rejects.toThrow();
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
  const signal = abort.signal;
  await Promise.all([
    (async () => {
      await new Promise((r) => setTimeout(r, 150));
      abort.abort();
    })(),
    expect(fetch(new Name("/R"), { signal })).rejects.toThrow(),
    expect(consume(fetch(new Name("/R"), { signal }))).rejects.toThrow(),
    expect(consume(fetch(new Name("/R"), { signal }).chunks())).rejects.toThrow(),
    expect(consume(fetch(new Name("/R"), { signal }).unordered())).rejects.toThrow(),
  ]);

  server.close();
});

test("congestion avoidance", async () => {
  const fw = Forwarder.create();
  const server = serve("/R", new BufferChunkSource(objectBody), { endpoint: new Endpoint({ fw }) });

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
  bridge.faceA.addRoute(new Name("/"));

  const fetched = fetch(new Name("/R"));
  await expect(fetched).resolves.toEqualUint8Array(objectBody);
  server.close();
  bridge.close();
}, 10000);
