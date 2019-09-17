import expect from "expect";

import { Component, ComponentLike } from "../src";

expect.extend({
  toEqualComponent(received, comp: ComponentLike) {
    if (received.equals(comp)) {
      return {
        message: () => `expected ${received} not to equal ${Component.from(comp).toString()}`,
        pass: true,
      };
    }
    return {
      message: () => `expected ${received} to equal ${Component.from(comp).toString()}`,
      pass: false,
    };
  },
});

declare global {
  namespace jest {
    interface Matchers<R> {
      toEqualComponent(comp: ComponentLike): R;
    }
  }
}
