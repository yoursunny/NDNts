import "@ndn/util/test-fixture/expect";

import { Endpoint } from "@ndn/endpoint";
import { Segment, Version } from "@ndn/naming-convention2";
import { Data, Name } from "@ndn/packet";
import { makeMetadataPacket, MetadataKeyword } from "@ndn/rdr";
import { BufferChunkSource, DataProducer } from "@ndn/segmented-object";
import { makeObjectBody } from "@ndn/segmented-object/test-fixture/object-body";
import { collect } from "streaming-iterables";
import { afterAll, beforeAll, beforeEach, expect, test } from "vitest";

import { buildDirectoryListing, Client, FileMetadata, lsKeyword, ModeDir, ModeFile } from "..";

// Directory hierarchy:
//   /
//   /A
//   /A/B.bin

const prefix = new Name("/fs");
let client: Client;
const versionRoot = Date.now();
const versionA = versionRoot - 1000;
const versionB = versionRoot - 2000;
let bodyB: Buffer;
const segNumsB = new Set<number>();
beforeAll(() => {
  const endpoint = new Endpoint();

  const versionedNameRoot = prefix.append(lsKeyword, Version.create(versionRoot));
  endpoint.produce(
    versionedNameRoot.append(Segment, 0),
    async ({ name }) => new Data(name, Data.FinalBlock, buildDirectoryListing([
      { name: "A", isDir: true },
    ])),
  );
  endpoint.produce(
    prefix.append(MetadataKeyword),
    async (interest) => {
      const m = new FileMetadata(versionedNameRoot);
      m.mode = ModeDir;
      m.mtime = new Date(versionRoot);
      return makeMetadataPacket(m, { prefix: interest.name });
    },
  );

  const versionedNameA = prefix.append("A", lsKeyword, Version.create(versionA));
  endpoint.produce(
    versionedNameA.append(Segment, 0),
    async ({ name }) => new Data(name, Data.FinalBlock, buildDirectoryListing([
      { name: "B.bin", isDir: false },
    ])),
  );
  endpoint.produce(
    prefix.append("A", MetadataKeyword),
    async (interest) => {
      const m = new FileMetadata(versionedNameA);
      m.mode = ModeDir;
      m.mtime = new Date(versionA);
      return makeMetadataPacket(m, { prefix: interest.name });
    },
  );

  const versionedNameB = prefix.append("A", "B.bin", Version.create(versionB));
  bodyB = makeObjectBody(200 * 1000 + 500);
  const producerB = DataProducer.create(new BufferChunkSource(bodyB, { chunkSize: 1000 }), versionedNameB);
  endpoint.produce(versionedNameB, (interest, producer) => {
    const segNum = interest.name.at(-1).as(Segment);
    expect(segNum).toBeLessThanOrEqual(200);
    segNumsB.add(segNum);
    return producerB.processInterest(interest, producer);
  });
  endpoint.produce(
    prefix.append("A", "B.bin", MetadataKeyword),
    async (interest) => {
      const m = new FileMetadata(versionedNameB);
      m.finalBlock = Segment.create(200);
      m.segmentSize = 1000;
      m.size = bodyB.length;
      m.mode = ModeFile;
      m.mtime = new Date(versionA);
      return makeMetadataPacket(m, { prefix: interest.name });
    },
  );
});
beforeEach(() => {
  client = new Client(prefix);
  segNumsB.clear();
});
afterAll(Endpoint.deleteDefaultForwarder);

test("readdir", async () => {
  const statRoot = await client.stat("");
  const des = await collect(client.readdir(statRoot));
  expect(des).toHaveLength(1);
  expect(des[0].name).toEqual("A");
  expect(des[0].isDir).toBeTruthy();
});

test("readFile", async () => {
  const statA = await client.stat("A");
  const des = await collect(client.readdir(statA));
  expect(des).toHaveLength(1);
  expect(des[0].name).toEqual("B.bin");
  expect(des[0].isDir).toBeFalsy();

  const statB = await client.stat("A", des[0]);
  const readB = await client.readFile(statB);
  expect(readB).toEqualUint8Array(bodyB);
});

test.each([
  [0, 200 * 1000 + 500, 201],
  [190 * 1000 + 1, 200 * 1000, 10],
  [190 * 1000, 200 * 1000 + 1, 11],
  [500, 501, 1],
  [500, 500, 0],
  [1000, 1000, 0],
])("readFileInto %d-%d", async (fileBegin, fileEnd, nSegs) => {
  const buffer = new Uint8Array(400 + (fileEnd - fileBegin) + 600);
  const bufferHeadTail = makeObjectBody(buffer.length);
  buffer.set(bufferHeadTail);

  const statB = await client.stat("A/B.bin");
  await client.readFileInto(statB, buffer, 400, fileEnd - fileBegin, fileBegin);
  expect(segNumsB.size).toBe(nSegs);
  expect(buffer.subarray(0, 400)).toEqualUint8Array(bufferHeadTail.subarray(0, 400));
  expect(buffer.subarray(-600)).toEqualUint8Array(bufferHeadTail.subarray(-600));
  expect(buffer.subarray(400, -600)).toEqualUint8Array(bodyB.subarray(fileBegin, fileEnd));
});
