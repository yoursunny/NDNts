import expect from "expect";

import { toHex } from "..";

function toBeVoid() {
  return {
    message: () => "expected to be void",
    pass: true,
  };
}

export type Uint8ArrayExpect = Uint8Array | Array<number | undefined>;

export function toEqualUint8Array(received: Uint8Array, expected: Uint8ArrayExpect) {
  let pass: boolean;
  let expectedHex: string;
  if (expected instanceof Uint8Array) {
    pass = Buffer.compare(received, expected) === 0;
    expectedHex = toHex(expected);
  } else {
    pass = received.length === expected.length &&
           received.every((ch, i) => expected[i] === undefined || ch === expected[i]);
    expectedHex = expected.map((v) => v === undefined ? "??" : v.toString(16).padStart(2, "0")).join("");
  }

  return {
    message: () => `expected ${toHex(received)} ${pass ? "not " : ""}to equal ${expectedHex}`,
    pass,
  };
}

expect.extend({
  toBeVoid,
  toEqualUint8Array,
});

declare global {
  namespace jest {
    interface Matchers<R, T> {
      toBeVoid: () => R;
      toEqualUint8Array: (expected: Uint8ArrayExpect) => R;
    }
  }
}
