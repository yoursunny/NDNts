import "@ndn/util/test-fixture/expect";

import { assert } from "node:console";

import { configure as bfsConfigure, fs as bfs, registerBackend as bfsRegisterBackend } from "@browserfs/core/index.js";
import { Endpoint } from "@ndn/endpoint";
import { Segment, Version } from "@ndn/naming-convention2";
import { Data, Name } from "@ndn/packet";
import { makeMetadataPacket, MetadataKeyword } from "@ndn/rdr";
import { BufferChunkSource, DataProducer } from "@ndn/segmented-object";
import { makeObjectBody } from "@ndn/segmented-object/test-fixture/object-body";
import { collect } from "streaming-iterables";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

import { buildDirectoryListing, Client, FileMetadata, lsKeyword, ModeDir, ModeFile, NDNFileSystem } from "..";

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

  client = new Client(prefix);

  bfsRegisterBackend(NDNFileSystem);
  await bfsConfigure({
    "/N": {
      fs: "NDN",
      options: { client },
    },
  });
});
afterAll(Endpoint.deleteDefaultForwarder);

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

test.each(readFileIntoCases)("readFileInto [%d,%d)", async (...tc) => {
  await testReadFileInto(async (...args) => {
    const statB = await client.stat("A/B.bin");
    await client.readFileInto(statB, ...args);
  }, ...tc);
});

test("bfs rejects", async () => {
  expect(() => bfs.statSync("/N/A")).toThrow(/ENOTSUP/);
  expect(() => bfs.readdirSync("/N/A")).toThrow(/ENOTSUP/);
  await expect(bfs.promises.open("/N/A/B.bin", "w")).rejects.toThrow(/ENOTSUP/);

  // below are not ENOTSUP due to BaseFilesystem wrappers
  expect(() => bfs.readFileSync("/N/A/B.bin")).toThrow(/ENOENT/);
  expect(() => bfs.openSync("/N/A/B.bin", "r")).toThrow(/ENOENT/);
});

test("bfs stat", async () => {
  const statRoot = await bfs.promises.stat("/N");
  expect(statRoot.isDirectory()).toBeTruthy();

  const statA = await bfs.promises.stat("/N/A");
  expect(statA.isDirectory()).toBeTruthy();

  const statB = await bfs.promises.stat("/N/A/B.bin");
  expect(statB.isFile()).toBeTruthy();
  expect(statB.size).toBe(bodyB.length);
});

describe("bfs open", () => {
  let fd: number;
  beforeAll(async () => {
    const fh = await bfs.promises.open("/N/A/B.bin", "r");
    assert(typeof fh === "number"); // https://github.com/browser-fs/core/issues/32
    fd = fh as unknown as number;
  });
  afterAll(async () => {
    await bfs.promises.close(fd);
  });

  test("rejects", () => {
    const buf = new Uint8Array(16);
    expect(() => bfs.readSync(fd, buf)).toThrow(/ENOTSUP/);
    expect(() => bfs.readSync(fd, buf, 0, 16, 0)).toThrow(/ENOTSUP/);
  });

  test("stat", async () => {
    expect(bfs.fstatSync(fd).size).toBe(bodyB.length);
    expect((await bfs.promises.fstat(fd)).size).toBe(bodyB.length);
  });

  test.each(readFileIntoCases)("read [%d,%d)", async (...tc) => {
    await testReadFileInto(async (...args) => {
      await bfs.promises.read(fd, ...args);
    }, ...tc);
  });
});

test("bfs readdir", async () => {
  await expect(bfs.promises.readdir("/N")).resolves.toEqual(["A"]);
  await expect(bfs.promises.readdir("/N/A")).resolves.toEqual(["B.bin"]);
});

test("bfs readFile", async () => {
  await expect(bfs.promises.readFile("/N/A/B.bin")).resolves.toEqualUint8Array(bodyB);
});
