import expect from "expect";

import { Component, ComponentLike, Name, NameLike } from "../src";

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
    interface Matchers<R> {
      toEqualComponent(comp: ComponentLike): R;
      toEqualName(name: NameLike): R;
    }
  }
}
