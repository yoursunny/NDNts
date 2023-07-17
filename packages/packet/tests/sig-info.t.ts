import "../test-fixture/expect";

import { Decoder } from "@ndn/tlv";
import { beforeEach, describe, expect, test } from "vitest";

import { Data, digestSigning, Interest, KeyLocator, Name, noopSigning, SigInfo, SignedInterestPolicy, SigType, TT } from "..";

test("KeyLocator", () => {
  expect(() => new KeyLocator({} as any)).toThrow();

  let kl = new KeyLocator("/KL", Uint8Array.of(0xA0, 0xA1));
  expect(kl).toEncodeAs(({ type, value }) => {
    expect(type).toBe(TT.KeyLocator);
    expect(value).toMatchTlv(
      ({ decoder }) => expect(decoder.decode(Name)).toEqualName("/KL"),
      ({ type, value }) => {
        expect(type).toBe(TT.KeyDigest);
        expect(value).toEqualUint8Array([0xA0, 0xA1]);
      },
    );
  });

  kl = new KeyLocator(kl);
  expect(kl.name).toEqualName("/KL");
  expect(kl.digest).toEqualUint8Array([0xA0, 0xA1]);
  expect(KeyLocator.mustGetName(kl)).toEqualName("/KL");

  kl.name = undefined;
  expect(() => KeyLocator.mustGetName(kl)).toThrow();
  expect(() => KeyLocator.mustGetName(undefined)).toThrow();
});

test("SigInfo encode", () => {
  expect(() => new SigInfo({} as any)).toThrow();

  let si = new SigInfo();
  expect(si.type).toBe(SigType.Null);

  si.type = SigType.Sha256;
  expect(si.encodeAs(TT.ISigInfo)).toEncodeAs(({ type, value }) => {
    expect(type).toBe(TT.ISigInfo);
    expect(value).toMatchTlv(
      ({ type, value }) => {
        expect(type).toBe(TT.SigType);
        expect(value).toEqualUint8Array([SigType.Sha256]);
      },
    );
  });

  si = new SigInfo(SigType.Sha256WithRsa, "/KL", SigInfo.Nonce(),
    SigInfo.Time(1157512424208), SigInfo.SeqNum(0xF598C7n));
  expect(si.encodeAs(TT.ISigInfo)).toEncodeAs(({ type, value }) => {
    expect(type).toBe(TT.ISigInfo);
    expect(value).toMatchTlv(
      ({ type, value }) => {
        expect(type).toBe(TT.SigType);
        expect(value).toEqualUint8Array([SigType.Sha256WithRsa]);
      },
      ({ type, value }) => {
        expect(type).toBe(TT.KeyLocator);
        expect(value).toMatchTlv(
          ({ decoder }) => { expect(decoder.decode(Name)).toEqualName("/KL"); },
        );
      },
      ({ type, length }) => {
        expect(type).toBe(TT.SigNonce);
        expect(length).toBe(8);
      },
      ({ type, value }) => {
        expect(type).toBe(TT.SigTime);
        expect(value).toEqualUint8Array([0x00, 0x00, 0x01, 0x0D, 0x81, 0x1D, 0xEB, 0x10]);
      },
      ({ type, value }) => {
        expect(type).toBe(TT.SigSeqNum);
        expect(value).toEqualUint8Array([0x00, 0xF5, 0x98, 0xC7]);
      },
    );
  });

  si.type = SigType.HmacWithSha256;
  si.keyLocator = new KeyLocator(new Uint8Array(32));
  si.nonce = undefined;
  si.time = undefined;
  si.seqNum = undefined;
  si = new SigInfo(si);
  expect(si.encodeAs(TT.DSigInfo)).toEncodeAs(({ type, value }) => {
    expect(type).toBe(TT.DSigInfo);
    expect(value).toMatchTlv(
      ({ type, value }) => {
        expect(type).toBe(TT.SigType);
        expect(value).toEqualUint8Array([SigType.HmacWithSha256]);
      },
      ({ type, value }) => {
        expect(type).toBe(TT.KeyLocator);
        expect(value).toMatchTlv(
          ({ type, length }) => {
            expect(type).toBe(TT.KeyDigest);
            expect(length).toBe(32);
          },
        );
      },
    );
  });
});

test("SigInfo decode", () => {
  let decoder = new Decoder(Uint8Array.of(
    0x16, 0x03,
    0x1B, 0x01, 0x00,
  ));
  let si = decoder.decode(SigInfo);
  expect(si.type).toBe(SigType.Sha256);

  decoder = new Decoder(Uint8Array.of(
    0x16, 0x0B,
    0x1B, 0x01, 0x03,
    0x1C, 0x06, 0x07, 0x04, 0x08, 0x02, 0x4B, 0x4C,
  ));
  si = decoder.decode(SigInfo);
  expect(si.type).toBe(SigType.Sha256WithEcdsa);
  expect(si.keyLocator?.name).toEqualName("/KL");
  expect(si.keyLocator?.digest).toBeUndefined();

  decoder = new Decoder(Uint8Array.of(
    0x2C, 0x18,
    0x1B, 0x01, 0x04,
    0x1C, 0x05, 0x1D, 0x03, 0xA0, 0xA1, 0xA2,
    0x26, 0x04, 0xB0, 0xB1, 0xB2, 0xB3,
    0x28, 0x02, 0xC0, 0xC1,
    0x2A, 0x02, 0xD0, 0xD1,
  ));
  si = decoder.decode(SigInfo);
  expect(si.type).toBe(SigType.HmacWithSha256);
  expect(si.keyLocator?.digest).toEqualUint8Array([0xA0, 0xA1, 0xA2]);
  expect(si.nonce).toEqualUint8Array([0xB0, 0xB1, 0xB2, 0xB3]);
  expect(si.time).toEqual(0xC0C1);
  expect(si.seqNum).toBe(0xD0D1n);
});

describe("SignedInterestPolicy", () => {
  let policyNTS: SignedInterestPolicy;
  let policyN: SignedInterestPolicy;
  let policyN16: SignedInterestPolicy;
  let policyT: SignedInterestPolicy;
  let policyS: SignedInterestPolicy;

  beforeEach(() => {
    policyNTS = new SignedInterestPolicy(
      SignedInterestPolicy.Nonce(), SignedInterestPolicy.Time(), SignedInterestPolicy.SeqNum());
    policyN = new SignedInterestPolicy({}, SignedInterestPolicy.Nonce());
    policyN16 = new SignedInterestPolicy(SignedInterestPolicy.Nonce({ minNonceLength: 16 }));
    policyT = new SignedInterestPolicy(SignedInterestPolicy.Time());
    policyS = new SignedInterestPolicy(SignedInterestPolicy.SeqNum());
  });

  test("ctor", () => {
    expect(() => new SignedInterestPolicy()).toThrow(/no rules/);
    expect(() => new SignedInterestPolicy({})).toThrow(/no rules/);
    expect(() => new SignedInterestPolicy({}, SignedInterestPolicy.Nonce(), SignedInterestPolicy.Time())).not.toThrow();
  });

  function updateSign(policy: SignedInterestPolicy, interest: Interest) {
    policy.update(interest);
    return digestSigning.sign(interest);
  }

  test.each([
    [
      (interest: Interest) => digestSigning.sign(policyNTS.wrapInterest(interest)),
      (interest: Interest) => digestSigning.verify(policyNTS.wrapInterest(interest)),
    ],
    [
      (interest: Interest) => policyNTS.makeSigner(digestSigning).sign(interest),
      (interest: Interest) => policyNTS.makeVerifier(digestSigning).verify(interest),
    ],
  ])("update %#", async (signFunc, verifyFunc) => {
    const interest0 = new Interest("/A/0");
    const interest1 = new Interest("/A/1");
    const t0 = Date.now();
    await signFunc(interest0);
    await signFunc(interest1);
    const t1 = Date.now();

    expect(interest0.sigInfo).toBeDefined();
    expect(interest1.sigInfo).toBeDefined();

    expect(interest0.sigInfo!.nonce).toBeDefined();
    expect(interest1.sigInfo!.nonce).toBeDefined();
    expect(interest0.sigInfo!.nonce!).toHaveLength(8);
    expect(interest1.sigInfo!.nonce!).toHaveLength(8);
    expect(interest0.sigInfo!.nonce!).not.toEqualUint8Array(interest1.sigInfo!.nonce!);

    expect(interest0.sigInfo!.time).toBeDefined();
    expect(interest1.sigInfo!.time).toBeDefined();
    expect(interest0.sigInfo!.time!).toBeGreaterThanOrEqual(t0);
    expect(interest0.sigInfo!.time!).toBeLessThanOrEqual(t1);
    expect(interest1.sigInfo!.time!).toBeGreaterThan(interest0.sigInfo!.time!);

    expect(interest0.sigInfo!.seqNum).toBeDefined();
    expect(interest1.sigInfo!.seqNum).toBeDefined();
    expect(interest1.sigInfo!.seqNum!).toBeGreaterThan(interest0.sigInfo!.seqNum!);

    await verifyFunc(interest0);
    await verifyFunc(interest1);
  });

  test("verify not signed Interest", async () => {
    const verifier0 = policyNTS.makeVerifier(noopSigning, {
      passData: false,
      passUnsignedInterest: false,
    });
    const verifier1 = policyNTS.makeVerifier(noopSigning, {
      passData: true,
      passUnsignedInterest: true,
    });

    const data = new Data("/D/0");
    const interest = new Interest("/I/0");

    await expect(verifier0.verify(data)).rejects.toThrow();
    await expect(verifier0.verify(interest)).rejects.toThrow();
    await verifier1.verify(data);
    await verifier1.verify(interest);
  });

  test("no save on bad signature", async () => {
    const interest0 = new Interest("/A/0");
    const interest1 = new Interest("/A/1");
    const interest2 = new Interest("/A/2");
    await updateSign(policyS, interest0);
    await updateSign(policyS, interest1);
    await updateSign(policyS, interest2);
    interest2.sigValue[0] ^= 0xFF;

    const verifier = policyS.makeVerifier(digestSigning);
    await verifier.verify(interest0);
    await expect(verifier.verify(interest2)).rejects.toThrow();
    await verifier.verify(interest1);
  });

  test("missing field", async () => {
    const interest0 = new Interest("/A/0");
    await updateSign(policyN, interest0);
    expect(() => policyT.check(interest0)).toThrow();
    expect(() => policyS.check(interest0)).toThrow();

    const interest1 = new Interest("/A/1");
    await updateSign(policyT, interest1);
    expect(() => policyN.check(interest1)).toThrow();
  });

  test("SigNonce short", async () => {
    const interest0 = new Interest("/A/0");
    await updateSign(policyN, interest0);
    expect(() => policyN16.check(interest0)).toThrow();
  });

  test("SigNonce duplicate", async () => {
    const interest0 = new Interest("/A/0");
    await updateSign(policyN16, interest0);
    const interest1 = new Interest("/A/1");
    await updateSign(policyN16, interest1);
    interest1.sigInfo!.nonce = interest0.sigInfo!.nonce;

    policyN.check(interest0)();
    expect(() => policyN.check(interest1)).toThrow();
  });

  test("SigTime offset", async () => {
    const interest0 = new Interest("/A/0");
    await updateSign(policyT, interest0);
    interest0.sigInfo!.time! -= 100000;
    expect(() => policyT.check(interest0)).toThrow();

    const interest1 = new Interest("/A/1");
    await updateSign(policyT, interest1);
    interest1.sigInfo!.time! += 100000;
    expect(() => policyT.check(interest1)).toThrow();
  });

  test("SigTime reorder", async () => {
    const interest0 = new Interest("/A/0");
    await updateSign(policyT, interest0);
    const interest1 = new Interest("/A/1");
    await updateSign(policyT, interest1);

    policyT.check(interest1)();
    expect(() => policyT.check(interest0)).toThrow();
  });

  test("SigSeqNum reorder", async () => {
    const interest0 = new Interest("/A/0");
    await updateSign(policyS, interest0);
    const interest1 = new Interest("/A/1");
    await updateSign(policyS, interest1);

    policyS.check(interest1)();
    expect(() => policyS.check(interest0)).toThrow();
  });
});
