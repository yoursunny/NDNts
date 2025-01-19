export const RouteFlags = {
  ChildInherit: 1 << 0,
  Capture: 1 << 1,
} as const;

export const enum TT { // eslint-disable-line etc/no-const-enum
  ControlParameters = 0x68,
  Cost = 0x6A,
  ExpirationPeriod = 0x6D,
  Flags = 0x6C,
  Origin = 0x6F,
  // These are copied from an-nfd.ts to reduce browser bundle size.
  // Unit tests verify consistency of these TLV-TYPE numbers.
  // Do not export this 'const enum' outside this package.
}
