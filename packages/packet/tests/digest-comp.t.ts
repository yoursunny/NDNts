import "../test-fixture/expect";

import { AltUri, Component, ImplicitDigest, Name, NamingConvention, ParamsDigest, TT } from "..";

interface Row {
  CompType: NamingConvention<Uint8Array>;
  tt: number;
  altUriPrefix: string;
}

const TABLE = [
  { CompType: ImplicitDigest, tt: TT.ImplicitSha256DigestComponent, altUriPrefix: "sha256digest" },
  { CompType: ParamsDigest, tt: TT.ParametersSha256DigestComponent, altUriPrefix: "params-sha256" },
] as Row[];

test.each(TABLE)("DigestComp %#", ({ CompType, tt, altUriPrefix }) => {
  expect(NamingConvention.isConvention(CompType)).toBeTruthy();

  const digest = new Uint8Array(32);
  digest[1] = 0xAA;
  const name = new Name().append(CompType, digest);
  const comp = name.at(0);
  expect(comp).toEqualComponent(`${tt}=%00%aa${"%00".repeat(30)}`);
  expect(comp.is(CompType)).toBeTruthy();
  expect(comp.as(CompType)).toEqual(digest);
  expect(AltUri.ofComponent(comp)).toBe(`${altUriPrefix}=00aa${"00".repeat(30)}`);
  expect(AltUri.parseComponent(`${altUriPrefix}=00aa${"00".repeat(30)}`)).toEqualComponent(comp);
  expect(AltUri.parseName(`/${altUriPrefix}=00AA${"00".repeat(30)}`)).toEqualName(new Name([comp]));

  expect(() => CompType.create(new Uint8Array(7))).toThrow();
  expect(() => new Component().as(CompType)).toThrow();
});

test("ImplicitDigest strip", () => {
  expect(ImplicitDigest.strip(new Name("/A"))).toEqualName("/A");

  const digest = new Uint8Array(32);
  digest[1] = 0xAA;
  expect(ImplicitDigest.strip(new Name("/A").append(ImplicitDigest.create(digest)))).toEqualName("/A");
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
