import { Keyword } from "@ndn/naming-convention2";

export const TT = {
  SegmentSize: 0xF500,
  Size: 0xF502,
  Mode: 0xF504,
  Atime: 0xF506,
  Btime: 0xF508,
  Ctime: 0xF50A,
  Mtime: 0xF50C,
};

export const ModeFile = 0x8000;
export const ModeDir = 0x4000;

/** 32=ls component */
export const lsKeyword = Keyword.create("ls");
