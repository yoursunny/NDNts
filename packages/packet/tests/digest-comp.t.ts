import "../test-fixture/expect";

import { Component, ImplicitDigest, Name, NamingConvention, ParamsDigest, TT } from "..";

interface Row {
  compType: NamingConvention<Uint8Array, Uint8Array>;
  tt: number;
}

const TABLE = [
  { compType: ImplicitDigest, tt: TT.ImplicitSha256DigestComponent },
  { compType: ParamsDigest, tt: TT.ParametersSha256DigestComponent },
] as Row[];

test.each(TABLE)("DigestComp %#", ({ compType, tt }) => {
  const digest = new Uint8Array(32);
  digest[1] = 0xAA;
  const name = new Name().append(compType, digest);
  expect(name.at(0)).toEqualComponent(`${tt}=%00%aa${"%00".repeat(30)}`);
  expect(name.at(0).is(compType)).toBeTruthy();
  expect(name.at(0).as(compType)).toEqual(digest);

  expect(() => compType.create(new Uint8Array(7))).toThrow();
  expect(() => new Component().as(compType)).toThrow();
});

test("ParamsDigest placeholder", () => {
  let name = new Name("/A/B/C");
  expect(ParamsDigest.findIn(name)).toBeLessThan(0);
  expect(ParamsDigest.findIn(name, false)).toBeLessThan(0);
  expect(ParamsDigest.isPlaceholder(name.at(1))).toBeFalsy();

  name = name.replaceAt(1, ParamsDigest.PLACEHOLDER);
  expect(ParamsDigest.findIn(name)).toBe(1);
  expect(ParamsDigest.findIn(name, false)).toBeLessThan(0);
  expect(ParamsDigest.isPlaceholder(name.at(1))).toBeTruthy();

  name = name.replaceAt(1, ParamsDigest.create(new Uint8Array(32)));
  expect(ParamsDigest.findIn(name)).toBe(1);
  expect(ParamsDigest.findIn(name, false)).toBe(1);
  expect(ParamsDigest.isPlaceholder(name.at(1))).toBeFalsy();
});
