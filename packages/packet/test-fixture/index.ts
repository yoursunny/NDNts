import { Decoder, Encoder } from "@ndn/tlv";
import expect from "expect";

import { Component, ComponentLike, Data, Name, NameLike } from "..";

/** Obtain Data full name without being cached on Data packet. */
export async function getDataFullName(data: Data): Promise<Name> {
  const copy = new Decoder(Encoder.encode(data)).decode(Data);
  return await copy.computeFullName();
}

expect.extend({
  toEqualComponent(received: Component, comp: ComponentLike) {
    if (received.equals(comp)) {
      return {
        message: () => `expected ${received} not to equal ${Component.from(comp)}`,
        pass: true,
      };
    }
    return {
      message: () => `expected ${received} to equal ${Component.from(comp)}`,
      pass: false,
    };
  },
  toEqualName(received: Name, name: NameLike) {
    if (received.equals(name)) {
      return {
        message: () => `expected ${received} not to equal ${new Name(name)}`,
        pass: true,
      };
    }
    return {
      message: () => `expected ${received} to equal ${new Name(name)}`,
      pass: false,
    };
  },
});

declare global {
  namespace jest {
    interface Matchers<R, T> {
      toEqualComponent(comp: ComponentLike): R;
      toEqualName(name: NameLike): R;
    }
  }
}
