import "@ndn/packet/test-fixture/expect";

import { Timestamp } from "@ndn/naming-convention2";
import { Component, Name } from "@ndn/packet";

import { KeyName } from "../..";

test("construct", () => {
  const kn = new KeyName(new Name("/owner"), Component.from("keyid"));
  expect(kn.subjectName).toEqualName("/owner");
  expect(kn.keyId).toEqualComponent("keyid");
  expect(kn.toName()).toEqualName("/owner/KEY/keyid");
});

test("from", () => {
  const kn = KeyName.from(new Name("/owner/KEY/keyid"));
  expect(kn.subjectName).toEqualName("/owner");
  expect(kn.keyId).toEqualComponent("keyid");
  expect(kn.toName()).toEqualName("/owner/KEY/keyid");

  expect(() => KeyName.from(new Name("/owner/keyid"))).toThrow(/invalid/);
});

test("create from subjectName", () => {
  const kn = KeyName.create("/owner");
  expect(kn.subjectName).toEqualName("/owner");
  expect(kn.keyId.is(Timestamp)).toBeTruthy();

  const name = kn.toName();
  expect(name).toHaveLength(3);
  expect(name.getPrefix(2)).toEqualName("/owner/KEY");
  expect(name.at(-1).is(Timestamp)).toBeTruthy();
});

test("create from keyName", () => {
  const kn0 = new KeyName(new Name("/owner"), Component.from("keyid"));

  const kn1 = KeyName.create(kn0);
  expect(kn1.toName()).toEqualName(kn0.toName());

  const kn2 = KeyName.create(kn0.toName());
  expect(kn2.toName()).toEqualName(kn0.toName());
});
