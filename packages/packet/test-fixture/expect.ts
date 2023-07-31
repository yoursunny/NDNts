import "@ndn/tlv/test-fixture/expect";

import set from "mnemonist/set.js";
import { expect } from "vitest";

import { Component, type ComponentLike, Name, type NameLike } from "..";

expect.extend({
  toEqualComponent(received: Component | undefined, comp: ComponentLike) {
    const expected = Component.from(comp);
    if (received instanceof Component && received.equals(expected)) {
      return {
        message: () => `expected ${received} not to equal ${expected}`,
        pass: true,
      };
    }
    return {
      message: () => `expected ${received} to equal ${expected}`,
      pass: false,
    };
  },
  toEqualName(received: Name | undefined, name: NameLike) {
    const expected = Name.from(name);
    if (received instanceof Name && received.equals(expected)) {
      return {
        message: () => `expected ${received} not to equal ${expected}`,
        pass: true,
      };
    }
    return {
      message: () => `expected ${received} to equal ${expected}`,
      pass: false,
    };
  },
  toHaveName(received: { readonly name?: Name } | undefined, name: NameLike) {
    const expected = Name.from(name);
    const desc = (not: string) => `expected ${
      received?.name ? `${received} (with name ${received.name})` : `${received} (without name)`
    } ${not}to have name ${expected}`;
    if (received?.name?.equals(expected)) {
      return {
        message: () => desc("not "),
        pass: true,
      };
    }
    return {
      message: () => desc(""),
      pass: false,
    };
  },
  toEqualNames(received: Iterable<Name> | undefined, names: Iterable<NameLike>) {
    const actual = new Set<string>();
    for (const name of received ?? []) {
      actual.add(`${name}`);
    }
    const expected = new Set<string>();
    for (const name of names) {
      expected.add(`${Name.from(name)}`);
    }
    const missing = set.difference(expected, actual);
    const excess = set.difference(actual, expected);
    if (missing.size + excess.size === 0) {
      return {
        message: () => "expected name sets to be unequal",
        pass: true,
      };
    }
    return {
      message: () => `expected name sets to be equal, missing ${Array.from(missing).join(",")}, excess ${Array.from(excess).join(",")}`,
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
      toEqualNames: (names: Iterable<NameLike>) => R;
    }
  }
}
