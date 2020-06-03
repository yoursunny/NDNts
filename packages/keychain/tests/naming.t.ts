import "@ndn/packet/test-fixture/expect";

import { Timestamp, Version } from "@ndn/naming-convention2";
import { Component, Name } from "@ndn/packet";

import { CertNaming } from "..";

test("toSubjectName", () => {
  expect(CertNaming.toSubjectName(new Name("/owner"))).toEqualName("/owner");
  expect(CertNaming.toSubjectName(new Name("/owner/KEY/key-id"))).toEqualName("/owner");
  expect(CertNaming.toSubjectName(new Name("/owner/KEY/key-id/issuer-id/version"))).toEqualName("/owner");
});

test("isKeyName parseKeyName", () => {
  expect(CertNaming.isKeyName(new Name("/owner"))).toBeFalsy();
  expect(CertNaming.isKeyName(new Name("/owner/KEY"))).toBeFalsy();
  expect(CertNaming.isKeyName(new Name("/owner/KEY/key-id/issuer-id"))).toBeFalsy();
  expect(CertNaming.isKeyName(new Name("/owner/KEY/key-id/issuer-id/version"))).toBeFalsy();

  const name = new Name("/owner/KEY/key-id");
  expect(CertNaming.isKeyName(name)).toBeTruthy();
  const parsed = CertNaming.parseKeyName(name);
  expect(parsed.subjectName).toEqualName("/owner");
  expect(parsed.keyId.equals("key-id")).toBeTruthy();
});

test("toKeyName", () => {
  expect(() => CertNaming.toKeyName(new Name("/owner"))).toThrow();
  expect(CertNaming.toKeyName(new Name("/owner/KEY/key-id")))
    .toEqualName("/owner/KEY/key-id");
  expect(CertNaming.toKeyName(new Name("/owner/KEY/key-id/issuer-id/version")))
    .toEqualName("/owner/KEY/key-id");
});

test("makeKeyName", () => {
  const opts = {
    keyId: Component.from("key-id"),
  };
  expect(CertNaming.makeKeyName(new Name("/owner"), opts))
    .toEqualName("/owner/KEY/key-id");
  expect(CertNaming.makeKeyName(new Name("/owner/KEY/key-id"), opts))
    .toEqualName("/owner/KEY/key-id");
  expect(CertNaming.makeKeyName(new Name("/owner/KEY/key-id/issuer-id/version"), opts))
    .toEqualName("/owner/KEY/key-id");

  const keyName = CertNaming.makeKeyName(new Name("/owner"));
  const parsed = CertNaming.parseKeyName(keyName);
  expect(parsed.subjectName).toEqualName("/owner");
  expect(Timestamp.match(parsed.keyId)).toBeTruthy();
});

test("isCertName parseCertName", () => {
  expect(CertNaming.isCertName(new Name("/owner"))).toBeFalsy();
  expect(CertNaming.isCertName(new Name("/owner/KEY"))).toBeFalsy();
  expect(CertNaming.isCertName(new Name("/owner/KEY/key-id"))).toBeFalsy();
  expect(CertNaming.isCertName(new Name("/owner/KEY/key-id/issuer-id"))).toBeFalsy();

  const name = new Name("/owner/KEY/key-id/issuer-id/version");
  expect(CertNaming.isCertName(name)).toBeTruthy();
  const parsed = CertNaming.parseCertName(name);
  expect(parsed.subjectName).toEqualName("/owner");
  expect(parsed.keyId.equals("key-id")).toBeTruthy();
  expect(parsed.issuerId.equals("issuer-id")).toBeTruthy();
  expect(parsed.version.equals("version")).toBeTruthy();
});

test("makeCertName", () => {
  const opts = {
    keyId: Component.from("key-id"),
    issuerId: Component.from("issuer-id"),
    version: Component.from("version"),
  };
  expect(CertNaming.makeCertName(new Name("/owner"), opts))
    .toEqualName("/owner/KEY/key-id/issuer-id/version");
  expect(CertNaming.makeCertName(new Name("/owner/KEY/key-id"), opts))
    .toEqualName("/owner/KEY/key-id/issuer-id/version");
  expect(CertNaming.makeCertName(new Name("/owner/KEY/key-id/issuer-id/version"), opts))
    .toEqualName("/owner/KEY/key-id/issuer-id/version");

  const certName = CertNaming.makeCertName(new Name("/owner"));
  const parsed = CertNaming.parseCertName(certName);
  expect(parsed.subjectName).toEqualName("/owner");
  expect(Timestamp.match(parsed.keyId)).toBeTruthy();
  expect(Version.match(parsed.version)).toBeTruthy();
});
