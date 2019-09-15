import expect = require("expect");

import { Encoder } from "../encoder";

type Uint8ArrayExpect = Uint8Array|Array<number|undefined>;

function toEqualUint8Array(received: Uint8Array, expected: Uint8ArrayExpect) {
  let pass: boolean;
  if (expected instanceof Uint8Array) {
    pass = Buffer.compare(received, expected) === 0;
  } else {
    pass = received.length === expected.length &&
           received.every((ch, i) => typeof expected[i] === "undefined" || ch === expected[i]);
  }

  if (pass) {
    return {
      message: () => `expected ${received} not to equal ${expected}`,
      pass: true,
    };
  }
  return {
    message: () => `expected ${received} to equal ${expected}`,
    pass: false,
  };
}

expect.extend({
  toEqualUint8Array,

  toEncodeAs(received, expected: Uint8ArrayExpect) {
    let output;
    if (received instanceof Encoder) {
      output = received.output;
    } else {
      const encoder = new Encoder();
      encoder.encode(received);
      output = encoder.output;
    }
    return toEqualUint8Array(output, expected);
  },
});

declare global {
  namespace jest {
    interface Matchers<R> {
      toEqualUint8Array(a: Uint8ArrayExpect): R;
      toEncodeAs(a: Uint8ArrayExpect): R;
    }
  }
}
