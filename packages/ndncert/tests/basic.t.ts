import "@ndn/packet/test-fixture/expect";

import { type NamedSigner, type NamedVerifier, Certificate, CertNaming, ECDSA, generateSigningKey, RSA, SigningAlgorithmListFull, ValidityPeriod } from "@ndn/keychain";
import { Name } from "@ndn/packet";
import { toUtf8 } from "@ndn/util";
import { afterEach, beforeAll, beforeEach, describe, expect, test, vi } from "vitest";

import { CaProfile, ChallengeRequest, ChallengeResponse, crypto, matchProbe, NewRequest, NewResponse, ProbeRequest, ProbeResponse, Status } from "..";

let rootPvt: NamedSigner.PrivateKey;
let rootPub: NamedVerifier.PublicKey;
let rootCert: Certificate;
beforeAll(async () => {
  [rootPvt, rootPub] = await generateSigningKey("/root", RSA);
  rootCert = await Certificate.selfSign({ privateKey: rootPvt, publicKey: rootPub });
});

test("crypto", async () => {
  const [ecdhPvtA, ecdhPubA] = await crypto.generateEcdhKey();
  const [ecdhPvtB, ecdhPubB] = await crypto.generateEcdhKey();

  const salt = crypto.makeSalt();
  expect(() => crypto.checkSalt(salt)).not.toThrow();
  const requestId = crypto.makeRequestId();
  expect(() => crypto.checkRequestId(requestId)).not.toThrow();

  const { sessionEncrypter } = await crypto.makeSessionKey(
    ecdhPvtA, ecdhPubB, salt, requestId);
  const { sessionDecrypter } = await crypto.makeSessionKey(
    ecdhPvtB, ecdhPubA, salt, requestId);

  const plaintext = Uint8Array.of(0xA0, 0xA1, 0xA2, 0xA3);
  const encrypted = await sessionEncrypter.llEncrypt({ plaintext, additionalData: requestId });
  const decrypted = await sessionDecrypter.llDecrypt({ ...encrypted, additionalData: requestId });
  expect(decrypted.plaintext).toEqualUint8Array(plaintext);
});

test("packets", async () => {
  const caSIP = crypto.makeSignedInterestPolicy();
  const profile = await CaProfile.build({
    prefix: new Name("/root"),
    info: "root CA",
    probeKeys: ["uid"],
    maxValidityPeriod: 86400000,
    cert: rootCert,
    signer: rootPvt,
    version: 7,
    algoList: SigningAlgorithmListFull,
  });
  const { data: profileData } = profile;
  expect(profileData.name).toEqualName("/root/CA/INFO/54=%07/50=%00");
  expect(profileData.isFinalBlock).toBeTruthy();
  expect(profileData.sigInfo.keyLocator?.name).toEqualName(rootPub.name);
  expect(profile.prefix).toEqualName("/root");
  expect(profile.info).toBe("root CA");
  expect(profile.probeKeys).toEqual(["uid"]);
  expect(profile.maxValidityPeriod).toBe(86400000);
  expect(profile.cert.name).toEqualName(rootCert.name);

  await expect(ProbeRequest.build({
    profile,
    parameters: {},
  })).rejects.toThrow();
  await expect(ProbeRequest.build({
    profile,
    parameters: { uid: toUtf8("my-uid"), other: Uint8Array.of(0x01) },
  })).rejects.toThrow();
  const probeRequest = await ProbeRequest.build({
    profile,
    parameters: { uid: toUtf8("my-uid") },
  });
  const { interest: probeInterest } = probeRequest;
  expect(probeInterest.name).toHaveLength(4);
  expect(probeInterest.name.getPrefix(3)).toEqualName("/root/CA/PROBE");
  expect(probeInterest.appParameters).toBeDefined();
  expect(probeInterest.sigInfo).toBeUndefined();

  const caCertFullName = await rootCert.data.computeFullName();
  await expect(ProbeResponse.build({
    profile,
    request: probeRequest,
    signer: rootPvt,
  })).rejects.toThrow();
  await expect(ProbeResponse.build({
    profile,
    request: probeRequest,
    signer: rootPvt,
    redirects: [{ caCertFullName: caCertFullName.slice(0, -1) }],
  })).rejects.toThrow();
  await expect(ProbeResponse.build({
    profile,
    request: probeRequest,
    signer: rootPvt,
    redirects: [{ caCertFullName: caCertFullName.slice(0, -3).append(caCertFullName.at(-1)) }],
  })).rejects.toThrow();
  const probeResponse = await ProbeResponse.build({
    profile,
    request: probeRequest,
    signer: rootPvt,
    entries: [{ prefix: new Name("/allocated"), maxSuffixLength: 1 }, { prefix: new Name("/also-allocated") }],
    redirects: [{ caCertFullName }],
  });
  const { data: probeData } = probeResponse;
  await expect(probeData.canSatisfy(probeInterest)).resolves.toBeTruthy();
  expect(probeResponse.entries).toHaveLength(2);
  expect(probeResponse.redirects).toHaveLength(1);

  expect(matchProbe(probeResponse, new Name("/allocated"))).toBeTruthy();
  expect(matchProbe(probeResponse, new Name("/allocated/1"))).toBeTruthy();
  expect(matchProbe(probeResponse, new Name("/allocated/1/2"))).toBeFalsy();
  expect(matchProbe(probeResponse, new Name("/also-allocated/1/2/3"))).toBeTruthy();
  expect(matchProbe(probeResponse, new Name("/not-allocated"))).toBeFalsy();

  const reqSIP = crypto.makeSignedInterestPolicy();
  const [reqPvt, reqPub] = await generateSigningKey("/requester", ECDSA);
  const [reqEcdhPvt, reqEcdhPub] = await crypto.generateEcdhKey();
  const newRequest = await NewRequest.build({
    profile,
    signedInterestPolicy: reqSIP,
    ecdhPub: reqEcdhPub,
    publicKey: reqPub,
    privateKey: reqPvt,
  });
  const { interest: newInterest } = newRequest;
  expect(newInterest.name).toHaveLength(4);
  expect(newInterest.name.getPrefix(3)).toEqualName("/root/CA/NEW");
  expect(newInterest.sigInfo).toBeDefined();
  expect(CertNaming.toSubjectName(newRequest.certRequest.name)).toEqualName("/requester");

  const [caEcdhPvt, caEcdhPub] = await crypto.generateEcdhKey();
  const salt = crypto.makeSalt();
  const requestId = crypto.makeRequestId();
  const caSessionKey = await crypto.makeSessionKey(
    caEcdhPvt, newRequest.ecdhPub, salt, requestId);
  const newResponse = await NewResponse.build({
    profile,
    request: newRequest,
    ecdhPub: caEcdhPub,
    salt,
    requestId,
    challenges: ["pin"],
    signer: rootPvt,
  });
  const { data: newData } = newResponse;
  await expect(newData.canSatisfy(newInterest)).resolves.toBeTruthy();
  expect(newResponse.salt).toEqualUint8Array(salt);
  expect(newResponse.requestId).toEqualUint8Array(requestId);
  expect(newResponse.challenges).toEqual(["pin"]);

  const reqSessionKey = await crypto.makeSessionKey(
    reqEcdhPvt, newResponse.ecdhPub, salt, requestId);
  const { interest: challengeInterest } = await ChallengeRequest.build({
    profile,
    signedInterestPolicy: reqSIP,
    requestId,
    ...reqSessionKey,
    publicKey: reqPub,
    privateKey: reqPvt,
    selectedChallenge: "pin",
    parameters: { code: toUtf8("000000") },
  });
  expect(challengeInterest.name).toHaveLength(5);
  expect(challengeInterest.name.getPrefix(3)).toEqualName("/root/CA/CHALLENGE");
  expect(challengeInterest.sigInfo).toBeDefined();

  const lookupRequest = vi.fn().mockResolvedValue({
    sessionKey: caSessionKey,
    certRequestPub: newRequest.publicKey,
  });
  const challengeRequest = await ChallengeRequest.fromInterest(challengeInterest, {
    profile,
    signedInterestPolicy: caSIP,
    lookupRequest,
  });
  expect(lookupRequest).toHaveBeenCalledTimes(1);
  expect(lookupRequest).toHaveBeenCalledWith(requestId);
  expect(challengeRequest.selectedChallenge).toBe("pin");
  expect(Object.keys(challengeRequest.parameters)).toStrictEqual(["code"]);
  expect(challengeRequest.parameters.code).toEqualUint8Array(toUtf8("000000"));

  const { data: challengeData } = await ChallengeResponse.build({
    profile,
    ...caSessionKey,
    request: challengeRequest,
    status: Status.SUCCESS,
    issuedCertName: new Name("/issued-cert"),
    signer: rootPvt,
  });
  await expect(challengeData.canSatisfy(challengeInterest)).resolves.toBeTruthy();

  const challengeResponse = await ChallengeResponse.fromData(challengeData, profile, requestId, reqSessionKey.sessionDecrypter);
  expect(challengeResponse.status).toBe(Status.SUCCESS);
  expect(challengeResponse.issuedCertName).toEqualName("/issued-cert");
});

describe("ValidityPeriod", () => {
  const caValidityDuration = 60000;
  let profile: CaProfile;

  afterEach(() => { vi.restoreAllMocks(); });

  beforeEach(async () => {
    const [caPvt, caPub] = await generateSigningKey("/root/authority");
    const now = Date.now();
    const cert = await Certificate.selfSign({
      privateKey: caPvt,
      publicKey: caPub,
      validity: new ValidityPeriod(now, now + caValidityDuration),
    });
    profile = await CaProfile.build({
      prefix: new Name("/root/authority"),
      info: "authority CA",
      probeKeys: [],
      maxValidityPeriod: 86400000,
      cert,
      signer: caPvt,
      version: 7,
    });
  });

  async function buildNewRequest(validity?: ValidityPeriod): Promise<NewRequest> {
    const reqSIP = crypto.makeSignedInterestPolicy();
    const [reqPvt, reqPub] = await generateSigningKey("/requester");
    const [, reqEcdhPub] = await crypto.generateEcdhKey();
    return NewRequest.build({
      profile,
      signedInterestPolicy: reqSIP,
      ecdhPub: reqEcdhPub,
      publicKey: reqPub,
      privateKey: reqPvt,
      validity,
    });
  }

  test("expired CA certificate", async () => {
    vi.useFakeTimers();
    vi.advanceTimersByTime(2 * caValidityDuration);
    await expect(buildNewRequest()).rejects.toThrow(/ValidityPeriod/);
  });

  test("expired requester certificate", async () => {
    const now = Date.now();
    await expect(buildNewRequest(
      new ValidityPeriod(now - 3600_000, now - 1800_000),
    )).rejects.toThrow(/ValidityPeriod/);
  });
});
