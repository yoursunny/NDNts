import { toEqualUint8Array, Uint8ArrayExpect } from "@ndn/util/test-fixture/expect";
import { expect } from "vitest";

import { Decoder, Encodable, Encoder } from "..";

type TlvMatcher = (tlv: Decoder.Tlv) => void;

function toMatchTlv(received: Uint8Array, ...checks: TlvMatcher[]) {
  const decoder = new Decoder(received);
  for (const check of checks) {
    check(decoder.read());
  }
  if (decoder.eof) {
    return {
      message: () => `expected ${received} not to match TLV`,
      pass: true,
    };
  }
  return {
    message: () => `expected ${received} to match TLV`,
    pass: false,
  };
}

function toEncodeAs(received: Encoder | Encodable, ...args: any[]) {
  let output: Uint8Array;
  if (received instanceof Encoder) {
    output = received.output;
  } else {
    output = Encoder.encode(received);
  }

  if (args.length === 1 && (args[0] instanceof Uint8Array || Array.isArray(args[0]))) {
    return toEqualUint8Array(output, args[0]);
  }
  return toMatchTlv(output, ...args);
}

expect.extend({
  toEncodeAs,
  toMatchTlv,
});

declare global {
  namespace jest {
    interface Matchers<R, T> {
      toMatchTlv: (...checks: TlvMatcher[]) => R;
      toEncodeAs: ((expected: Uint8ArrayExpect) => R) & ((...checks: TlvMatcher[]) => R);
    }
  }
}
