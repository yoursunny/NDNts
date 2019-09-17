import { ImplicitDigest, Name, ParamsDigest } from "../src";
import "../src/expect";

test("ImplicitDigest", () => {
  const digest = new Uint8Array(32);
  digest[1] = 0xAA;
  const name = new Name().append(ImplicitDigest, digest);
  expect(name.at(0)).toEqualComponent("1=%00%aa" + "%00".repeat(30));
  expect(name.at(0).is(ImplicitDigest)).toBeTruthy();
  expect(ImplicitDigest.parse(name.at(0))).toEqual(digest);
  expect(() => ImplicitDigest.create(new Uint8Array(7))).toThrow();
});

test("ParamsDigest", () => {
  const digest = new Uint8Array(32);
  digest[1] = 0xAA;
  const name = new Name().append(ParamsDigest, digest);
  expect(name.at(0)).toEqualComponent("2=%00%aa" + "%00".repeat(30));
  expect(name.at(0).is(ParamsDigest)).toBeTruthy();
  expect(ParamsDigest.parse(name.at(0))).toEqual(digest);
  expect(() => ParamsDigest.create(new Uint8Array(7))).toThrow();
});
