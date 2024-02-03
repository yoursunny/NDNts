import { TT as l3TT } from "@ndn/packet";

export const TT = {
  LpPacket: 0x64,
  LpPayload: 0x50,
  LpSeqNum: 0x51,
  FragIndex: 0x52,
  FragCount: 0x53,
  PitToken: 0x62,
  Nack: l3TT.Nack,
  NackReason: l3TT.NackReason,
  CongestionMark: 0x0340,
} as const;
