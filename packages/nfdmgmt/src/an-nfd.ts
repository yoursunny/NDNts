/* eslint-disable @typescript-eslint/no-duplicate-enum-values --
 * TLV-TYPE numbers can have duplicates
**/
export const enum TT {
  BaseCongestionMarkingInterval = 0x87,
  Capacity = 0x83,
  ChannelStatus = 0x82,
  ControlParameters = 0x68,
  Cost = 0x6A,
  Count = 0x84,
  CsInfo = 0x80,
  CurrentTimestamp = 0x82,
  DefaultCongestionThreshold = 0x88,
  ExpirationPeriod = 0x6D,
  FaceEventKind = 0xC1,
  FaceEventNotification = 0xC0,
  FaceId = 0x69,
  FacePersistency = 0x85,
  FaceQueryFilter = 0x96,
  FaceScope = 0x84,
  FaceStatus = 0x80,
  Flags = 0x6C,
  LinkType = 0x86,
  LocalUri = 0x81,
  Mask = 0x70,
  Mtu = 0x89,
  NCsEntries = 0x87,
  NfdVersion = 0x80,
  NFibEntries = 0x84,
  NHits = 0x81,
  NInBytes = 0x94,
  NInData = 0x91,
  NInInterests = 0x90,
  NInNacks = 0x97,
  NMeasurementsEntries = 0x86,
  NMisses = 0x82,
  NNameTreeEntries = 0x83,
  NOutBytes = 0x95,
  NOutData = 0x93,
  NOutInterests = 0x92,
  NOutNacks = 0x98,
  NPitEntries = 0x85,
  NSatisfiedInterests = 0x99,
  NUnsatisfiedInterests = 0x9A,
  Origin = 0x6F,
  RibEntry = 0x80,
  Route = 0x81,
  StartTimestamp = 0x81,
  Strategy = 0x6B,
  StrategyChoice = 0x80,
  Uri = 0x72,
  UriScheme = 0x83,
}
/* eslint-enable @typescript-eslint/no-duplicate-enum-values */

export enum FaceScope {
  NonLocal = 0,
  Local = 1,
}

export enum LinkType {
  PointToPoint = 0,
  MultiAccess = 1,
  AdHocWireless = 2,
}

export enum FacePersistency {
  OnDemand = 0,
  Persistent = 1,
  Permanent = 2,
}

export const FaceFlags = {
  LocalFields: 1 << 0,
  LpReliability: 1 << 1,
  CongestionMarking: 1 << 2,
} as const;

export const CsFlags = {
  EnableAdmit: 1 << 0,
  EnableServe: 1 << 1,
} as const;

export const RouteFlags = {
  ChildInherit: 1 << 0,
  Capture: 1 << 1,
} as const;
