import "@ndn/packet/test-fixture/expect";

import { CertNaming, EcCurve, KeyChain, RsaModulusLength } from "@ndn/keychain";
import * as TestCertStore from "@ndn/keychain/test-fixture/cert-store";
import * as TestKeyStore from "@ndn/keychain/test-fixture/key-store";
import { SafeBag } from "@ndn/ndnsec";
import { SafeBagEC, SafeBagRSA } from "@ndn/ndnsec/test-fixture/safe-bag";
import { Name, SigType } from "@ndn/packet";
import * as TestSignVerify from "@ndn/packet/test-fixture/sign-verify";
import { Decoder } from "@ndn/tlv";
import { beforeEach, expect, test } from "vitest";

import { navigateToPage, pageInvoke } from "../../test-fixture/pptr";
import * as Serialize from "../../test-fixture/serialize";

beforeEach(() => navigateToPage(import.meta));

test("KeyStore", async () => {
  const enabled: TestKeyStore.Enable = { Ed25519: false };
  const result = await pageInvoke<typeof globalThis.testKeyStore>("testKeyStore", enabled);
  TestKeyStore.check(result, enabled);
});

test("CertStore", async () => {
  const result = await pageInvoke<typeof globalThis.testCertStore>("testCertStore");
  TestCertStore.check(result);
});

test("SHA256", async () => {
  const [rI, rD] = Serialize.parse(
    await pageInvoke<typeof globalThis.testDigestSigning>("testDigestSigning"));
  TestSignVerify.check(rI, { deterministic: true, sameAB: true });
  TestSignVerify.check(rD, { deterministic: true, sameAB: true });
});

test.each(EcCurve.Choices)("ECDSA %s", async (curve) => {
  const [rI, rD] = Serialize.parse(
    await pageInvoke<typeof globalThis.testECDSA>("testECDSA", curve));
  TestSignVerify.check(rI);
  TestSignVerify.check(rD);
});

test.each(RsaModulusLength.Choices)("RSA %d", async (modulusLength) => {
  const [rI, rD] = Serialize.parse(
    await pageInvoke<typeof globalThis.testRSA>("testRSA", modulusLength));
  TestSignVerify.check(rI, { deterministic: true });
  TestSignVerify.check(rD, { deterministic: true });
});

test("HMAC", async () => {
  const [rI, rD] = Serialize.parse(
    await pageInvoke<typeof globalThis.testHMAC>("testHMAC"));
  TestSignVerify.check(rI, { deterministic: true });
  TestSignVerify.check(rD, { deterministic: true });
});

test("Ed25519", async () => {
  const [rI, rD] = Serialize.parse(
    await pageInvoke<typeof globalThis.testEd25519>("testEd25519"));
  TestSignVerify.check(rI, { deterministic: true });
  TestSignVerify.check(rD, { deterministic: true });
});

test.each([
  SafeBagEC, SafeBagRSA,
])("SafeBagDecode %#", async ({ sigType, certName, wire, passphrase }) => {
  const [aSigType, aCertName] =
    await pageInvoke<typeof globalThis.testSafeBagDecode>("testSafeBagDecode", Serialize.stringify(wire), passphrase);
  expect(aSigType).toBe(sigType);
  expect(new Name(aCertName)).toEqualName(certName);
});

test("SafeBagEncode", async () => {
  const passphrase = "9c570742-82ed-41a8-a370-8e0c8806e5e4";
  const wire = Serialize.parse(
    await pageInvoke<typeof globalThis.testSafeBagEncode>("testSafeBagEncode", passphrase));

  const safeBag = Decoder.decode(wire, SafeBag);
  const { certificate: cert } = safeBag;
  expect(cert.isSelfSigned).toBeTruthy();
  expect(CertNaming.toSubjectName(cert.name)).toEqualName("/S");
  const keyName = CertNaming.toKeyName(cert.name);

  const keyChain = KeyChain.createTemp();
  await safeBag.saveKeyPair(passphrase, keyChain);
  const pvt = await keyChain.getKey(keyName, "signer");
  expect(pvt.name).toEqualName(keyName);
  expect(pvt.sigType).toBe(SigType.Sha256WithEcdsa);
});
