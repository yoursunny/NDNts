import "@ndn/packet/test-fixture/expect";

import { Name } from "@ndn/packet";
import { printESM } from "@ndn/trust-schema";
import { console } from "@ndn/util";
import { expect, test, vi } from "vitest";

import { toPolicy, type UserFn } from "..";
import { pyndn0, pyndn1, pyndn2, pyndn3 } from "../test-fixture/lvstlv";

test("pyndn0", () => {
  const model = pyndn0();
  // console.log(model.toString());

  const policy = toPolicy(model);
  // console.log(printESM(policy));
  // console.log(versec.print(policy));
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
  console.log(model.toString());
  expect(model.nodes).toHaveLength(26);
});

test("pyndn2", () => {
  const model = pyndn2();
  console.log(model.toString());
});

test("pyndn3", () => {
  const model = pyndn3();
  // console.log(model.toString());

  const $fn = vi.fn<UserFn>();
  const policy = toPolicy(model, { $fn });
  console.log(printESM(policy));

  $fn.mockReturnValue(true);
  expect(policy.match(new Name("/x/y"))).toHaveLength(1);
  expect($fn).toHaveBeenCalledOnce();
  expect($fn.mock.calls[0]![0]).toEqualComponent("y");
  expect($fn.mock.calls[0]![1]).toHaveLength(2);
  expect($fn.mock.calls[0]![1][0]).toEqualComponent("c");
  expect($fn.mock.calls[0]![1][1]).toEqualComponent("x");
});
