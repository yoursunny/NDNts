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
