import "@ndn/util/test-fixture/expect";

import { produce } from "@ndn/endpoint";
import { Forwarder } from "@ndn/fw";
import { Segment, Version } from "@ndn/naming-convention2";
import { Data, Name } from "@ndn/packet";
import { makeMetadataPacket, MetadataKeyword } from "@ndn/rdr";
import { BufferChunkSource, DataProducer } from "@ndn/segmented-object";
import { makeObjectBody } from "@ndn/segmented-object/test-fixture/object-body";
import { configure as zenfsConfigure, fs as zenfs } from "@zenfs/core";
import { collect } from "streaming-iterables";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

import { buildDirectoryListing, Client, FileMetadata, lsKeyword, ModeDir, ModeFile, NDNZenFS } from "..";

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
beforeAll(async () => {
  const versionedNameRoot = prefix.append(lsKeyword, Version.create(versionRoot));
  produce(
    versionedNameRoot.append(Segment, 0),
    async ({ name }) => new Data(name, Data.FinalBlock, buildDirectoryListing([
      { name: "A", isDir: true },
    ])),
  );
  produce(
    prefix.append(MetadataKeyword),
    async (interest) => {
      const m = new FileMetadata(versionedNameRoot);
      m.mode = ModeDir;
      m.mtime = new Date(versionRoot);
      return makeMetadataPacket(m, { prefix: interest.name });
    },
  );

  const versionedNameA = prefix.append("A", lsKeyword, Version.create(versionA));
  produce(
    versionedNameA.append(Segment, 0),
    async ({ name }) => new Data(name, Data.FinalBlock, buildDirectoryListing([
      { name: "B.bin", isDir: false },
    ])),
  );
  produce(
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
  produce(versionedNameB, (interest, producer) => {
    const segNum = interest.name.at(-1).as(Segment);
    expect(segNum).toBeLessThanOrEqual(200);
    segNumsB.add(segNum);
    return producerB.processInterest(interest, producer);
  });
  produce(
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

  client = new Client(prefix);

  await zenfsConfigure({
    mounts: {
      "/N": {
        backend: NDNZenFS,
        client,
      },
    },
  });
});
afterAll(Forwarder.deleteDefault);

type ReadFileIntoCase = [fileBegin: number, fileEnd: number, nSegs: number];
const readFileIntoCases: readonly ReadFileIntoCase[] = [
  [0, 200 * 1000 + 500, 201],
  [190 * 1000 + 1, 200 * 1000, 10],
  [190 * 1000, 200 * 1000 + 1, 11],
  [190 * 1000 + 1, 200 * 1000 + 1, 11],
  [500, 501, 1],
  [500, 500, 0],
  [1000, 1000, 0],
];
async function testReadFileInto(
    doReadFileInto: (buffer: Uint8Array, offset: number, length: number, position: number) => Promise<void>,
    fileBegin: number, fileEnd: number, nSegs: number,
): Promise<void> {
  const [headL, tailL] = [400, 600];
  const buffer = new Uint8Array(headL + (fileEnd - fileBegin) + tailL);
  const bufferHeadTail = makeObjectBody(buffer.length);
  buffer.set(bufferHeadTail);

  segNumsB.clear();
  await doReadFileInto(buffer, headL, fileEnd - fileBegin, fileBegin);
  expect(segNumsB.size).toBe(nSegs);
  expect(buffer.subarray(0, headL)).toEqualUint8Array(bufferHeadTail.subarray(0, headL));
  expect(buffer.subarray(-tailL)).toEqualUint8Array(bufferHeadTail.subarray(-tailL));
  expect(buffer.subarray(headL, -tailL)).toEqualUint8Array(bodyB.subarray(fileBegin, fileEnd));
}

test("readdir", async () => {
  const statRoot = await client.stat("");
  const des = await collect(client.readdir(statRoot));
  expect(des).toHaveLength(1);
  expect(des[0]!.name).toEqual("A");
  expect(des[0]!.isDir).toBeTruthy();
});

test("readFile", async () => {
  const statA = await client.stat("A");
  const des = await collect(client.readdir(statA));
  expect(des).toHaveLength(1);
  expect(des[0]!.name).toEqual("B.bin");
  expect(des[0]!.isDir).toBeFalsy();

  const statB = await client.stat("A", des[0]!);
  const readB = await client.readFile(statB);
  expect(readB).toEqualUint8Array(bodyB);
});

test.each(readFileIntoCases)("readFileInto [%d,%d)", async (...tc) => {
  await testReadFileInto(async (...args) => {
    const statB = await client.stat("A/B.bin");
    await client.readFileInto(statB, ...args);
  }, ...tc);
});

test("zenfs rejects", async () => {
  expect(() => zenfs.statSync("/N/A")).toThrow(/async/);
  expect(() => zenfs.readdirSync("/N/A")).toThrow(/async/);
  await expect(zenfs.promises.open("/N/A/B.bin", "w")).rejects.toThrow(/readonly/);
  expect(() => zenfs.readFileSync("/N/A/B.bin")).toThrow(/async/);
  expect(() => zenfs.openSync("/N/A/B.bin", "r")).toThrow(/async/);
});

test("zenfs stat", async () => {
  const statRoot = await zenfs.promises.stat("/N");
  expect(statRoot.isDirectory()).toBeTruthy();

  const statA = await zenfs.promises.stat("/N/A");
  expect(statA.isDirectory()).toBeTruthy();

  const statB = await zenfs.promises.stat("/N/A/B.bin");
  expect(statB.isFile()).toBeTruthy();
  expect(statB.size).toBe(bodyB.length);
});

describe("zenfs open", () => {
  let fh: zenfs.promises.FileHandle;
  beforeAll(async () => {
    fh = await zenfs.promises.open("/N/A/B.bin", "r");
  });
  afterAll(async () => {
    await fh.close();
  });

  test("stat", async () => {
    expect((await fh.stat()).size).toBe(bodyB.length);
  });

  test.each(readFileIntoCases)("read [%d,%d)", async (...tc) => {
    await testReadFileInto(async (...args) => {
      await fh.read(...args);
    }, ...tc);
  });
});

test("zenfs readdir", async () => {
  await expect(zenfs.promises.readdir("/N")).resolves.toEqual(["A"]);
  await expect(zenfs.promises.readdir("/N/A")).resolves.toEqual(["B.bin"]);
});

test("zenfs readFile", async () => {
  await expect(zenfs.promises.readFile("/N/A/B.bin")).resolves.toEqualUint8Array(bodyB);
});
