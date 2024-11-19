import "@ndn/packet/test-fixture/expect";

import { Name } from "@ndn/packet";
import { expect, test, vi } from "vitest";

import { toPolicy, type UserFn } from "..";
import { pyndn0, pyndn1, pyndn2, pyndn3, pyndn4 } from "../test-fixture/lvstlv";

test("pyndn0", () => {
  const model = pyndn0();
  const policy = toPolicy(model);

  expect(policy.canSign(
    new Name("/a/blog/article/math/2022/03"),
    new Name("/a/blog/author/xinyu/KEY/1/admin/1"),
  )).toBeTruthy();
  expect(policy.canSign(
    new Name("/a/blog/author/xinyu/KEY/1/admin/1"),
    new Name("/a/blog/admin/admin/KEY/1/root/1"),
  )).toBeTruthy();
  expect(policy.canSign(
    new Name("/a/blog/author/xinyu/KEY/1/admin/1"),
    new Name("/a/blog/KEY/1/self/1"),
  )).toBeFalsy();
});

test("pyndn1", () => {
  const model = pyndn1();
  expect(model.nodes).toHaveLength(26);
});

test("pyndn2", () => {
  const model = pyndn2();
  void model;
});

test("pyndn3", () => {
  const model = pyndn3();

  const $fn = vi.fn<UserFn>();
  const policy = toPolicy(model, { $fn });

  $fn.mockReturnValue(true);
  expect(policy.match(new Name("/x/y"))).toHaveLength(1);
  expect($fn).toHaveBeenCalledOnce();
  expect($fn.mock.calls[0]![0]).toEqualComponent("y");
  expect($fn.mock.calls[0]![1]).toHaveLength(2);
  expect($fn.mock.calls[0]![1][0]).toEqualComponent("c");
  expect($fn.mock.calls[0]![1][1]).toEqualComponent("x");
});

test.only("pyndn4", () => {
  const model = pyndn4();
  const policy = toPolicy(model);

  // https://github.com/named-data/python-ndn/blob/96ae4bfb0060435e3f19c11d37feca512a8bd1f5/tests/misc/light_versec_test.py#L293-L303
  expect(policy.match(new Name("/a/b/c"))).toHaveLength(1);
  expect(policy.match(new Name("/x/y/z"))).toHaveLength(1);
  expect(policy.match(new Name("/x/x/x"))).toHaveLength(1);
  expect(policy.match(new Name("/a/a/a"))).toHaveLength(1);
  expect(policy.match(new Name("/a/c/a"))).toHaveLength(0);
  expect(policy.match(new Name("/a/x/x"))).toHaveLength(0);
  expect(policy.canSign(new Name("/a/b/c"), new Name("/xxx/yyy/zzz"))).toBeTruthy();
  expect(policy.canSign(new Name("/x/y/z"), new Name("/xxx/xxx/xxx"))).toBeTruthy();
  expect(policy.canSign(new Name("/x/x/x"), new Name("/xxx/yyy/zzz"))).toBeTruthy();
  expect(policy.canSign(new Name("/a/a/a"), new Name("/xxx/xxx/xxx"))).toBeTruthy();
});
