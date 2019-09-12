import expect = require("expect");

import { Component, ComponentLike } from "..";

expect.extend({
  toEqualComponent(received, comp: ComponentLike) {
    if (!(received instanceof Component)) {
      throw new Error(`${received} must be instanceof Component`);
    }
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
