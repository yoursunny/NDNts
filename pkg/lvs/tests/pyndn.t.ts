import "@ndn/packet/test-fixture/expect";

import { Certificate, generateSigningKey, KeyChain } from "@ndn/keychain";
import { Component, Data, Name, ValidityPeriod } from "@ndn/packet";
import { printESM, TrustSchema, TrustSchemaSigner } from "@ndn/trust-schema";
import { expect, test, vi } from "vitest";

import { printUserFns, toPolicy, type UserFn } from "..";
import { pyndn0, pyndn1, pyndn2, pyndn3, pyndn4 } from "../test-fixture/lvstlv";

test("pyndn0", () => {
  const model = pyndn0();
  const policy = toPolicy(model);

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

test("pyndn1", async () => {
  const [laRootPvt, laRootPub] = await generateSigningKey("/la");
  const laRootCert = await Certificate.selfSign({ publicKey: laRootPub, privateKey: laRootPvt });
  const [nyRootPvt, nyRootPub] = await generateSigningKey("/ny");
  const nyRootCert = await Certificate.selfSign({ publicKey: nyRootPub, privateKey: nyRootPvt });

  const model = pyndn1();
  const policy = toPolicy(model, {
    $eq_type: (value, args) => value.type === args[0]?.type,
  });
  const schema = new TrustSchema(policy, [laRootCert, nyRootCert]);

  for (let i = 0b00; i <= 0b11; ++i) {
    const keyChain = KeyChain.createTemp();
    const authorCertNames: Name[] = [];
    if ((i & 0b01) !== 0) {
      const [, laAuthorPub] = await generateSigningKey(keyChain, "/la/author/1");
      const laAuthorCert = await Certificate.issue({
        publicKey: laAuthorPub,
        issuerPrivateKey: laRootPvt.withKeyLocator(laRootCert.name),
        validity: ValidityPeriod.daysFromNow(100),
        issuerId: Component.from("la-signer"),
      });
      await keyChain.insertCert(laAuthorCert);
      authorCertNames.push(laAuthorCert.name);
    }
    if ((i & 0b10) !== 0) {
      const [, nyAuthorPub] = await generateSigningKey(keyChain, "/ny/author/2");
      const nyAuthorCert = await Certificate.issue({
        publicKey: nyAuthorPub,
        issuerPrivateKey: nyRootPvt.withKeyLocator(nyRootCert.name),
        validity: ValidityPeriod.daysFromNow(100),
        issuerId: Component.from("ny-signer"),
      });
      await keyChain.insertCert(nyAuthorCert);
      authorCertNames.push(nyAuthorCert.name);
    }

    const signer = new TrustSchemaSigner({ keyChain, schema });
    const data = new Data("/article/eco/day1");
    if (authorCertNames.length === 0) {
      await expect(signer.findSigner(data.name)).rejects.toThrow(/no signer/);
    } else {
      await signer.sign(data);
      expect(authorCertNames.some((certName) => data.sigInfo.keyLocator?.name?.equals(certName)));
    }
  }
});

test("pyndn2", () => {
  const model = pyndn2();
  expect(model.nodes).toHaveLength(26);
});

test("pyndn3", () => {
  const model = pyndn3();
  expect(() => toPolicy(model)).toThrow(/missing user functions.*\$fn/);

  const policyPrintable = toPolicy(model, toPolicy.forPrint);
  expect(policyPrintable.match(new Name("/x/y"))).toHaveLength(0);
  expect(printESM(policyPrintable)).toContain("$fn");
  expect(printUserFns(policyPrintable)).toContain("$fn");

  const $fn = vi.fn<UserFn>();
  const policy = toPolicy(model, { $fn });

  $fn.mockReturnValue(true);
  expect(policy.match(new Name("/x/y"))).toHaveLength(1);
  expect($fn).toHaveBeenCalledOnce();
  expect($fn.mock.calls[0]![0]).toEqualComponent("y");
  expect($fn.mock.calls[0]![1]).toHaveLength(2);
  expect($fn.mock.calls[0]![1][0]).toEqualComponent("c");
  expect($fn.mock.calls[0]![1][1]).toEqualComponent("x");
});

test("pyndn4", () => {
  const model = pyndn4();
  const policy = toPolicy(model);

  // https://github.com/named-data/python-ndn/blob/96ae4bfb0060435e3f19c11d37feca512a8bd1f5/tests/misc/light_versec_test.py#L293-L303
  expect(policy.match(new Name("/a/b/c"))).toHaveLength(1);
  expect(policy.match(new Name("/x/y/z"))).toHaveLength(1);
  expect(policy.match(new Name("/x/x/x"))).toHaveLength(1);
  expect(policy.match(new Name("/a/a/a"))).toHaveLength(1);
  expect(policy.match(new Name("/a/c/a"))).toHaveLength(0);
  expect(policy.match(new Name("/a/x/x"))).toHaveLength(0);
  expect(policy.canSign(new Name("/a/b/c"), new Name("/xxx/yyy/zzz"))).toBeTruthy();
  expect(policy.canSign(new Name("/x/y/z"), new Name("/xxx/xxx/xxx"))).toBeTruthy();
  expect(policy.canSign(new Name("/x/x/x"), new Name("/xxx/yyy/zzz"))).toBeTruthy();
  expect(policy.canSign(new Name("/a/a/a"), new Name("/xxx/xxx/xxx"))).toBeTruthy();
});
