import "@ndn/packet/test-fixture/expect";

import { Timestamp, Version } from "@ndn/naming-convention2";
import { Component, Name } from "@ndn/packet";

import { CertificateName, KeyName } from "..";

describe("KeyName", () => {
  test("construct", () => {
    const kn = new KeyName(new Name("/owner"), Component.from("keyid"));
    expect(kn.subjectName).toEqualName("/owner");
    expect(kn.keyId).toEqualComponent("keyid");
    expect(kn.name).toEqualName("/owner/KEY/keyid");
  });

  test("from", () => {
    const kn = KeyName.from(new Name("/owner/KEY/keyid"));
    expect(kn.subjectName).toEqualName("/owner");
    expect(kn.keyId).toEqualComponent("keyid");
    expect(kn.name).toEqualName("/owner/KEY/keyid");

    expect(() => KeyName.from(new Name("/owner/keyid"))).toThrow(/invalid/);
  });

  test("create from subjectName", () => {
    const kn = KeyName.create("/owner");
    expect(kn.subjectName).toEqualName("/owner");
    expect(kn.keyId.is(Timestamp)).toBeTruthy();

    const name = kn.name;
    expect(name).toHaveLength(3);
    expect(name.getPrefix(2)).toEqualName("/owner/KEY");
    expect(name.at(-1).is(Timestamp)).toBeTruthy();
  });

  test("create from keyName", () => {
    const kn0 = new KeyName(new Name("/owner"), Component.from("keyid"));

    const kn1 = KeyName.create(kn0);
    expect(kn1.name).toEqualName(kn0.name);

    const kn2 = KeyName.create(kn0.name);
    expect(kn2.name).toEqualName(kn0.name);
  });
});

describe("CertificateName", () => {
  test("construct", () => {
    const cn = new CertificateName(new Name("/owner"), Component.from("keyid"),
      Component.from("issuer"), Version.create(2));
    expect(cn.subjectName).toEqualName("/owner");
    expect(cn.keyId).toEqualComponent("keyid");
    expect(cn.issuerId).toEqualComponent("issuer");
    expect(cn.version).toEqualComponent("35=%02");
    expect(cn.name).toEqualName("/owner/KEY/keyid/issuer/35=%02");
    expect(cn.key).toEqualName("/owner/KEY/keyid");
  });

  test("from", () => {
    const cn = CertificateName.from(new Name("/owner/KEY/keyid/issuer/35=%02"));
    expect(cn.subjectName).toEqualName("/owner");
    expect(cn.keyId).toEqualComponent("keyid");
    expect(cn.issuerId).toEqualComponent("issuer");
    expect(cn.version).toEqualComponent("35=%02");
    expect(cn.name).toEqualName("/owner/KEY/keyid/issuer/35=%02");

    expect(() => CertificateName.from(new Name("/owner/keyid/issuer/35=%02"))).toThrow(/invalid/);
  });
});
