import expect from "expect";

import { Decoder } from "../src/decoder";
import { Encoder } from "../src/encoder";

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

type TlvMatcher = (tlv: Decoder.Tlv) => any;

function toMatchTlv(received, ...checks: TlvMatcher[]) {
  const decoder = new Decoder(received as Uint8Array);
  checks.forEach((check) => {
    check(decoder.read());
  });
  if (decoder.eof) {
    return {
      message: `expected ${received} not to match TLV`,
      pass: true,
    };
  }
  return {
    message: `expected ${received} to match TLV`,
    pass: false,
  };
}

function toEncodeAs(...args) {
  const received = args[0];
  let output: Uint8Array;
  if (received instanceof Encoder) {
    output = received.output;
  } else {
    output = Encoder.encode(received);
  }

  if (args.length === 2 && (args[1] instanceof Uint8Array || Array.isArray(args[1]))) {
    return toEqualUint8Array(output, args[1]);
  }
  args[0] = output;
  return toMatchTlv.apply(undefined, args as any);
}

expect.extend({
  toEncodeAs,
  toEqualUint8Array,
  toMatchTlv,
});

declare global {
  namespace jest {
    interface Matchers<R> {
      toEqualUint8Array(expected: Uint8ArrayExpect): R;
      toMatchTlv(...checks: TlvMatcher[]): R;
      toEncodeAs(expected: Uint8ArrayExpect): R;
      toEncodeAs(...checks: TlvMatcher[]): R;
    }
  }
}
