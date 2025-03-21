import "@ndn/packet/test-fixture/expect";

import { Data, Name, SigType, ValidityPeriod } from "@ndn/packet";
import * as TestSignVerify from "@ndn/packet/test-fixture/sign-verify";
import { Decoder } from "@ndn/tlv";
import { fromHex } from "@ndn/util";
import { describe, expect, test } from "vitest";

import { Certificate, createVerifier, EcCurve, ECDSA, Ed25519, generateSigningKey, HMAC, KeyChain, RSA, RsaModulusLength, SigningAlgorithmListFull } from "../..";

describe.each(EcCurve.Choices)("ECDSA %s", (curve) => {
  test.each(TestSignVerify.PacketTable)("sign-verify $PacketType", async ({ Packet }) => {
    const [pvtA, pubA] = await generateSigningKey("/A/KEY/x", ECDSA, { curve });
    const [pvtB, pubB] = await generateSigningKey("/B/KEY/x", ECDSA, { curve });

    expect(pvtA.name).toEqualName("/A/KEY/x");
    expect(pubA.name).toEqualName("/A/KEY/x");
    expect(pvtB.name).toEqualName("/B/KEY/x");
    expect(pubB.name).toEqualName("/B/KEY/x");

    const record = await TestSignVerify.execute(Packet, pvtA, pubA, pvtB, pubB);
    TestSignVerify.check(record);
    expect(record.sA0.sigInfo.type).toBe(SigType.Sha256WithEcdsa);
    expect(record.sA0.sigInfo.keyLocator).toHaveName(pvtA.name);
  });

  test("load", async () => {
    const keyChain = KeyChain.createTemp();
    const name = new Name("/my/KEY/x");
    await generateSigningKey(keyChain, name, ECDSA, { curve });

    const { signer, publicKey } = await keyChain.getKeyPair(name);
    expect(signer.sigType).toBe(SigType.Sha256WithEcdsa);

    const now = Date.now();
    const cert = await Certificate.selfSign({
      privateKey: signer,
      publicKey,
      validity: new ValidityPeriod(now, now + 3600_000),
    });
    const verifier = await createVerifier(cert);
    expect(verifier.name).toEqualName(signer.name);
    expect(verifier.sigType).toBe(SigType.Sha256WithEcdsa);
    await verifier.verify(cert.data);

    await expect(createVerifier(cert, { now: now + 3602_000 })).rejects.toThrow();
  });
});

test("ECDSA importPkcs8", async () => {
  const { privateKey, publicKey } = await crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-384" }, true, ["sign", "verify"]);
  const importPkcs8: ECDSA.GenParams["importPkcs8"] = [
    new Uint8Array(await crypto.subtle.exportKey("pkcs8", privateKey)),
    new Uint8Array(await crypto.subtle.exportKey("spki", publicKey)),
  ];

  await expect(generateSigningKey("/B", ECDSA, { // wrong curve specified
    curve: "P-256", importPkcs8 })).rejects.toThrow();
  await expect(generateSigningKey("/B", ECDSA, { // correct curve specified
    curve: "P-384", importPkcs8 })).resolves.toBeDefined();
  await expect(generateSigningKey("/B", ECDSA, { // curve omitted, auto-detect
    importPkcs8 })).resolves.toBeDefined();
});

describe.each(RsaModulusLength.Choices)("RSA %d", (modulusLength) => {
  describe.each(TestSignVerify.PacketTable)("sign-verify $PacketType", ({ Packet }) => {
    test("", { timeout: 15000 }, async () => {
      const [pvtA, pubA] = await generateSigningKey("/A/KEY/x", RSA, { modulusLength });
      const [pvtB, pubB] = await generateSigningKey("/B/KEY/x", RSA, { modulusLength });

      const record = await TestSignVerify.execute(Packet, pvtA, pubA, pvtB, pubB);
      TestSignVerify.check(record, { deterministic: true });
      expect(record.sA0.sigInfo.type).toBe(SigType.Sha256WithRsa);
      expect(record.sA0.sigInfo.keyLocator).toHaveName(pvtA.name);
    });
  });

  test("load", { timeout: 15000 }, async () => {
    const keyChain = KeyChain.createTemp(SigningAlgorithmListFull);
    const name = new Name("/my/KEY/x");
    await generateSigningKey(keyChain, name, RSA, { modulusLength });

    const { signer, publicKey } = await keyChain.getKeyPair(name);
    expect(signer.sigType).toBe(SigType.Sha256WithRsa);

    const cert = await Certificate.selfSign({ privateKey: signer, publicKey });
    const verifier = await createVerifier(cert, { algoList: SigningAlgorithmListFull });
    expect(verifier.name).toEqualName(signer.name);
    expect(verifier.sigType).toBe(SigType.Sha256WithRsa);
    await verifier.verify(cert.data);
  });
});

describe("HMAC", () => {
  test.each(TestSignVerify.PacketTable)("sign-verify $PacketType", async ({ Packet }) => {
    const [pvtA, pubA] = await generateSigningKey("/A/KEY/x", HMAC);
    const [pvtB, pubB] = await generateSigningKey("/B/KEY/x", HMAC);

    const record = await TestSignVerify.execute(Packet, pvtA, pubA, pvtB, pubB);
    TestSignVerify.check(record, { deterministic: true });
    expect(record.sA0.sigInfo.type).toBe(SigType.HmacWithSha256);
    expect(record.sA0.sigInfo.keyLocator).toHaveName(pvtA.name);
  });

  test("verify", async () => {
    const wire = fromHex("063b070308014116121b01041c0d070b08014808034b4559080178172097ab86d234f84a5b3224838b9a99aa0d43fc9d6313bd772fbdc05ba79c2431cb");
    const pkt = Decoder.decode(wire, Data);

    const [, key] = await generateSigningKey("/H/KEY/x", HMAC, {
      importRaw: fromHex("A0A1A2A3A4A5A6A7A8A9AAABACADAEAF"),
    });
    await key.verify(pkt);
  });
});
/*
HMAC sample packet was generated by python-ndn version 0.2b2.post1

from ndn.encoding import make_data, MetaInfo
from ndn.security import HmacSha256Signer

key = b'\xA0\xA1\xA2\xA3\xA4\xA5\xA6\xA7\xA8\xA9\xAA\xAB\xAC\xAD\xAE\xAF'
signer = HmacSha256Signer("/H/KEY/x", key)

pkt = make_data("/A", meta_info=None, signer=signer)
print(pkt.hex())
*/

describe("Ed25519", () => {
  test.each(TestSignVerify.PacketTable)("sign-verify $PacketType", async ({ Packet }) => {
    const [pvtA, pubA] = await generateSigningKey("/A/KEY/x", Ed25519);
    const [pvtB, pubB] = await generateSigningKey("/B/KEY/x", Ed25519);

    const record = await TestSignVerify.execute(Packet, pvtA, pubA, pvtB, pubB);
    TestSignVerify.check(record, { deterministic: true });
    expect(record.sA0.sigInfo.type).toBe(SigType.Ed25519);
    expect(record.sA0.sigInfo.keyLocator).toHaveName(pvtA.name);
  });
});
