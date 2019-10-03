import { Component, Name } from "@ndn/name";
import { Version } from "@ndn/naming-convention-03";

import { CertificateName } from "../../src";

test("construct", () => {
  const cn = new CertificateName(new Name("/owner"), Component.from("keyid"),
                                 Component.from("issuer"), Version.create(2));
  expect(cn.subjectName.toString()).toBe("/owner");
  expect(cn.keyId.toString()).toBe("keyid");
  expect(cn.issuerId.toString()).toBe("issuer");
  expect(cn.version.toString()).toBe("35=%02");
  expect(cn.toName().toString()).toBe("/owner/KEY/keyid/issuer/35=%02");
  expect(cn.toKeyName().toName().toString()).toBe("/owner/KEY/keyid");
});

test("from", () => {
  const cn = CertificateName.from(new Name("/owner/KEY/keyid"));
  expect(cn.subjectName.toString()).toBe("/owner");
  expect(cn.keyId.toString()).toBe("keyid");
  expect(cn.issuerId.toString()).toBe("issuer");
  expect(cn.version.toString()).toBe("35=%02");
  expect(cn.toName().toString()).toBe("/owner/KEY/keyid/issuer/35=%02");

  expect(() => CertificateName.from(new Name("/owner/keyid/issuer/35=%02"))).toThrow(/invalid/);
});
