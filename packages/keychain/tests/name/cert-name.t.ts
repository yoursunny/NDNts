import "@ndn/name/test-fixture";

import { Component, Name } from "@ndn/name";
import { Version } from "@ndn/naming-convention2";

import { CertificateName } from "../..";

test("construct", () => {
  const cn = new CertificateName(new Name("/owner"), Component.from("keyid"),
                                 Component.from("issuer"), Version.create(2));
  expect(cn.subjectName).toEqualName("/owner");
  expect(cn.keyId).toEqualComponent("keyid");
  expect(cn.issuerId).toEqualComponent("issuer");
  expect(cn.version).toEqualComponent("35=%02");
  expect(cn.toName()).toEqualName("/owner/KEY/keyid/issuer/35=%02");
  expect(cn.toKeyName().toName()).toEqualName("/owner/KEY/keyid");
});

test("from", () => {
  const cn = CertificateName.from(new Name("/owner/KEY/keyid/issuer/35=%02"));
  expect(cn.subjectName).toEqualName("/owner");
  expect(cn.keyId).toEqualComponent("keyid");
  expect(cn.issuerId).toEqualComponent("issuer");
  expect(cn.version).toEqualComponent("35=%02");
  expect(cn.toName()).toEqualName("/owner/KEY/keyid/issuer/35=%02");

  expect(() => CertificateName.from(new Name("/owner/keyid/issuer/35=%02"))).toThrow(/invalid/);
});
