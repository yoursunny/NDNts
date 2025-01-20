export const RouteFlags = {
  ChildInherit: 1 << 0,
  Capture: 1 << 1,
} as const;

// Do not export these const enums outside this package.

export const enum TT { // eslint-disable-line etc/no-const-enum
  ControlParameters = 0x68,
  Cost = 0x6A,
  ExpirationPeriod = 0x6D,
  Flags = 0x6C,
  Origin = 0x6F,
  // These are copied from an-nfd.ts to reduce browser bundle size.
  // Unit tests verify consistency of these TLV-TYPE numbers.
}

export const enum RouteOrigin { // eslint-disable-line etc/no-const-enum
  client = 65,
  prefixann = 129,
}
