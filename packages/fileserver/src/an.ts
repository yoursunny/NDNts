import { Component } from "@ndn/packet";

export const TT = {
  SegmentSize: 0xF500,
  Size: 0xF502,
  Mode: 0xF504,
  Atime: 0xF506,
  Btime: 0xF508,
  Ctime: 0xF50A,
  Mtime: 0xF50C,
};

export const lsKeyword = Component.from("ls");

export const ModeFile = 0x8000;
export const ModeDir = 0x4000;
export type Mode = typeof ModeFile | typeof ModeDir;
