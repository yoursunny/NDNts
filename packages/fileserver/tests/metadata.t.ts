import "@ndn/tlv/test-fixture/expect";
import "@ndn/packet/test-fixture/expect";

import { Segment, Version } from "@ndn/naming-convention2";
import { Name, TT as l3TT } from "@ndn/packet";
import { makeMetadataPacket } from "@ndn/rdr";
import { Decoder } from "@ndn/tlv";
import { afterEach, expect, test } from "vitest";

import { FileMetadata, TT } from "..";
import { ModeDir, ModeReg } from "../src/an";

test("file", async () => {
  const m = new FileMetadata();
  m.name = new Name("/fileserver/file.txt").append(Version, 1);
  m.lastSeg = 1000;
  m.segmentSize = 6000;
  m.size = 5999966;
  m.mode = ModeReg | 0o644;
  m.atime = new Date(1683860400000);
  m.btime = new Date(1683849600000);
  m.ctime = new Date(1683853200000);
  m.mtime = new Date(1683856800000);

  const pkt = await makeMetadataPacket(m);
  expect(pkt.content).toMatchTlv(
    ({ type, value }) => {
      expect(type).toBe(l3TT.Name);
      expect(new Name(value)).toEqualName(m.name);
    },
    ({ type, value }) => {
      expect(type).toBe(l3TT.FinalBlock);
      expect(new Name(value).at(0)).toEqualComponent(Segment.create(1000));
    },
    ({ type, nni }) => {
      expect(type).toBe(TT.SegmentSize);
      expect(nni).toBe(6000);
    },
    ({ type, nni }) => {
      expect(type).toBe(TT.Size);
      expect(nni).toBe(5999966);
    },
    ({ type, nni }) => {
      expect(type).toBe(TT.Mode);
      expect(nni).toBe(m.mode);
    },
    ({ type, nniBig }) => {
      expect(type).toBe(TT.Atime);
      expect(nniBig).toBe(1683860400000000000n);
    },
    ({ type, nniBig }) => {
      expect(type).toBe(TT.Btime);
      expect(nniBig).toBe(1683849600000000000n);
    },
    ({ type, nniBig }) => {
      expect(type).toBe(TT.Ctime);
      expect(nniBig).toBe(1683853200000000000n);
    },
    ({ type, nniBig }) => {
      expect(type).toBe(TT.Mtime);
      expect(nniBig).toBe(1683856800000000000n);
    },
  );

  const d = new Decoder(pkt.content).decode(FileMetadata) as FileMetadata;
  expect(d.isFile).toBeTruthy();
  expect(d.isDir).toBeFalsy();
});

test("dir", async () => {
  const m = new FileMetadata();
  m.name = new Name("/fileserver/dir").append(Version, 1);
  m.mode = ModeDir | 0o755;
  m.mtime = new Date(1684281600000);

  const pkt = await makeMetadataPacket(m);
  expect(pkt.content).toMatchTlv(
    ({ type, value }) => {
      expect(type).toBe(l3TT.Name);
      expect(new Name(value)).toEqualName(m.name);
    },
    ({ type, nni }) => {
      expect(type).toBe(TT.Mode);
      expect(nni).toBe(m.mode);
    },
    ({ type, nniBig }) => {
      expect(type).toBe(TT.Mtime);
      expect(nniBig).toBe(1684281600000000000n);
    },
  );

  const d = new Decoder(pkt.content).decode(FileMetadata) as FileMetadata;
  expect(d.isFile).toBeFalsy();
  expect(d.isDir).toBeTruthy();
});
