import "@ndn/tlv/test-fixture/expect";

import expect from "expect";

import { Component, type ComponentLike, Name, type NameLike } from "..";

expect.extend({
  toEqualComponent(received: Component | undefined, comp: ComponentLike) {
    const c = Component.from(comp);
    if (received instanceof Component && received.equals(c)) {
      return {
        message: () => `expected ${received} not to equal ${c}`,
        pass: true,
      };
    }
    return {
      message: () => `expected ${received} to equal ${c}`,
      pass: false,
    };
  },
  toEqualName(received: Name | undefined, name: NameLike) {
    const n = new Name(name);
    if (received instanceof Name && received.equals(n)) {
      return {
        message: () => `expected ${received} not to equal ${n}`,
        pass: true,
      };
    }
    return {
      message: () => `expected ${received} to equal ${n}`,
      pass: false,
    };
  },
  toHaveName(received: { readonly name?: Name } | undefined, name: NameLike) {
    const n = new Name(name);
    if (received?.name?.equals(n)) {
      return {
        message: () => `expected ${received} not to have name ${n}`,
        pass: true,
      };
    }
    return {
      message: () => `expected ${received} to have name ${n}`,
      pass: false,
    };
  },
});

declare global {
  namespace jest {
    interface Matchers<R, T> {
      toEqualComponent: (comp: ComponentLike) => R;
      toEqualName: (name: NameLike) => R;
      toHaveName: (name: NameLike) => R;
    }
  }
}
