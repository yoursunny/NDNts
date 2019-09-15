import expect = require("expect");

import { Encoder } from "../encoder";

function toEqualUint8Array(received, a: ArrayLike<number>) {
  const expected = new Uint8Array(a);
  if (Buffer.compare(received as Uint8Array, expected) === 0) {
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

  toEncodeAs(received, a: ArrayLike<number>) {
    let output;
    if (received instanceof Encoder) {
      output = received.output;
    } else {
      const encoder = new Encoder();
      encoder.encode(received);
      output = encoder.output;
    }
    return toEqualUint8Array(output, a);
  },
});

declare global {
  namespace jest {
    interface Matchers<R> {
      toEqualUint8Array(a: ArrayLike<number>): R;
      toEncodeAs(a: ArrayLike<number>): R;
    }
  }
}
