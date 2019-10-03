import { Component, Name } from "@ndn/name";
import { Timestamp } from "@ndn/naming-convention-03";

import { KeyName } from "../../src";

test("construct", () => {
  const kn = new KeyName(new Name("/owner"), Component.from("keyid"));
  expect(kn.subjectName.toString()).toBe("/owner");
  expect(kn.keyId.toString()).toBe("keyid");
  expect(kn.toName().toString()).toBe("/owner/KEY/keyid");
});

test("from", () => {
  const kn = KeyName.from(new Name("/owner/KEY/keyid"));
  expect(kn.subjectName.toString()).toBe("/owner");
  expect(kn.keyId.toString()).toBe("keyid");
  expect(kn.toName().toString()).toBe("/owner/KEY/keyid");

  expect(() => KeyName.from(new Name("/owner/keyid"))).toThrow(/invalid/);
});

test("create from subjectName", () => {
  const kn = KeyName.create("/owner");
  expect(kn.subjectName.toString()).toBe("/owner");
  expect(kn.keyId.is(Timestamp)).toBeTruthy();

  const name = kn.toName();
  expect(name).toHaveLength(3);
  expect(name.getPrefix(2).toString()).toBe("/owner/KEY");
  expect(name.at(-1).is(Timestamp)).toBeTruthy();
});

test("create from keyName", () => {
  const kn0 = new KeyName(new Name("/owner"), Component.from("keyid"));

  const kn1 = KeyName.create(kn0);
  expect(kn1.toName().toString()).toBe(kn0.toName().toString());

  const kn2 = KeyName.create(kn0.toName());
  expect(kn2.toName().toString()).toBe(kn0.toName().toString());
});
