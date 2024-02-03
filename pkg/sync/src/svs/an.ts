import { Version } from "@ndn/naming-convention2";
import { Component } from "@ndn/packet";

export const TT = {
  StateVector: 0xC9,
  StateVectorEntry: 0xCA,
  SeqNo: 0xCC,
  MappingData: 0xCD,
  MappingEntry: 0xCE,
} as const;

export const MappingKeyword = Component.from("MAPPING");
export const Version0 = Version.create(0);
export const ContentTypeEncap = 6;
