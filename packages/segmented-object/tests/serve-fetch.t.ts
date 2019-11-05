import "@ndn/tlv/test-fixture";

import { Forwarder, SimpleEndpoint } from "@ndn/fw";
import { Interest } from "@ndn/l3pkt";
import { Name } from "@ndn/name";
import { Segment as Segment1 } from "@ndn/naming-convention1";
import { BufferReadableMock, BufferWritableMock } from "stream-mock";

import { fetch, serve } from "../src";

let objectBody: Buffer;

beforeAll(() => {
  objectBody = Buffer.alloc(1024 * 1024);
  for (let i = 0; i < objectBody.length; ++i) {
    objectBody[i] = Math.random() * 0x100;
  }
});

afterEach(() => Forwarder.deleteDefault());

test("buffer to buffer", async () => {
  const server = serve(new Name("/R"), objectBody);
  const fetcher = fetch(new Name("/R"));
  await expect(fetcher.promise).resolves.toEqualUint8Array(objectBody);
  await expect(fetcher.promise).resolves.toEqualUint8Array(objectBody);
  server.stop();
});

test("buffer to chunks", async () => {
  const server = serve(new Name("/R"), objectBody);
  const chunks = [] as Uint8Array[];
  for await (const chunk of fetch(new Name("/R")).chunks) {
    chunks.push(chunk);
  }
  expect(Buffer.concat(chunks)).toEqualUint8Array(objectBody);
  server.stop();
});

test("stream to stream", async () => {
  const src = new BufferReadableMock([objectBody]);
  const server = serve(new Name("/R"), src);

  const dst = new BufferWritableMock();
  const fetcher = fetch(new Name("/R"));
  await fetcher.writeToStream(dst);

  await new Promise((r) => dst.end(r));
  expect(objectBody.compare(dst.flatData)).toEqual(0);
  server.stop();
});

test("iterable to events", (done) => {
  const server = serve(new Name("/R"), (async function*() {
    const yieldSize = 5000;
    for (let i = 0; i < objectBody.length; i += yieldSize) {
      yield objectBody.subarray(i, i + yieldSize);
    }
  })(), {
    chunkSize: 6000,
  });

  const fetcher = fetch(new Name("/R"));

  const receivedSegments = new Set<number>();
  fetcher.on("segment", (segmentNum, data) => {
    expect(receivedSegments.has(segmentNum)).toBeFalsy();
    receivedSegments.add(segmentNum);
    expect(data.content.length <= 6000);
  });

  const fetched = [] as Uint8Array[];
  fetcher.on("data", (chunk) => {
    fetched.push(chunk);
  });

  fetcher.on("end", () => {
    expect(receivedSegments.size).toEqual(fetched.length);
    for (let i = 0; i < fetched.length; ++i) {
      expect(receivedSegments.has(i)).toBeTruthy();
    }
    expect(Buffer.concat(fetched)).toEqualUint8Array(objectBody);
    server.stop();
    done();
  });
});

test("ranged", async () => {
  const server = serve(new Name("/R"), objectBody, { chunkSize: 1024 }); // 1024 segments
  await expect(fetch(new Name("/R"), { segmentRange: [0, 8] }).promise)
    .resolves.toEqualUint8Array(objectBody.subarray(0, 8 * 1024));
  await expect(fetch(new Name("/R"), { segmentRange: [8, 24] }).promise)
    .resolves.toEqualUint8Array(objectBody.subarray(8 * 1024, 24 * 1024));
  await expect(fetch(new Name("/R"), { segmentRange: [1022, undefined] }).promise)
    .resolves.toEqualUint8Array(objectBody.subarray(1022 * 1024));
  await expect(fetch(new Name("/R"), { segmentRange: [1022, 1050] }).promise)
    .resolves.toEqualUint8Array(objectBody.subarray(1022 * 1024));
  await expect(fetch(new Name("/R"), { segmentRange: [1050, undefined], interestLifetime: 400 }).promise)
    .rejects.toThrow();
  server.stop();
});

test("empty object", async () => {
  const fw = Forwarder.create();
  const server = serve(new Name("/R"), new Uint8Array(), { fw, segmentNumConvention: Segment1 });

  const ep = new SimpleEndpoint(fw);
  await expect(ep.consume(new Interest(new Name("/R").append(Segment1, 1), Interest.Lifetime(50))))
        .rejects.toThrow();
  const data = await ep.consume(new Interest(new Name("/R").append(Segment1, 0)));
  expect(data.content).toHaveLength(0);

  server.stop();
});

test("segment number convention mismatch", async () => {
  const server = serve(new Name("/R"), objectBody, { segmentNumConvention: Segment1 });
  await expect(fetch(new Name("/R"), { interestLifetime: 400 }).promise).rejects.toThrow();
  server.stop();
});

test("abort", async () => {
  const src = (async function*() {
    const yieldSize = 8 * 1024;
    for (let i = 0; i < objectBody.length; i += yieldSize) {
      yield objectBody.subarray(i, i + yieldSize);
      await new Promise((r) => setTimeout(r, 100));
    }
  })();
  const server = serve(new Name("/R"), src);
  const fetcher = fetch(new Name("/R"), { interestLifetime: 400 });

  const onError = jest.fn<void, [Error]>();
  fetcher.on("error", onError);

  await Promise.all([
    (async () => {
      await new Promise((r) => setTimeout(r, 150));
      fetcher.abort();
    })(),
    expect(fetcher.promise).rejects.toThrow(/abort/),
    expect(fetcher.writeToStream(new BufferWritableMock())).rejects.toThrow(/abort/),
  ]);

  expect(onError).toHaveBeenCalled();
  server.stop();
});
