import "@ndn/packet/test-fixture/expect";

import { type NamedSigner, type NamedVerifier, Certificate, CertNaming, ECDSA, generateSigningKey, RSA, SigningAlgorithmListFull, ValidityPeriod } from "@ndn/keychain";
import { Name } from "@ndn/packet";
import { toUtf8 } from "@ndn/util";

import { CaProfile, ChallengeRequest, ChallengeResponse, crypto, NewRequest, NewResponse, Status } from "../..";

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

  const lookupRequest = jest.fn().mockResolvedValue({
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

test("expired CA certificate", async () => {
  const [caPvt, caPub] = await generateSigningKey("/root/authority");
  const now = Date.now();
  const caCert = await Certificate.selfSign({ privateKey: caPvt, publicKey: caPub, validity: new ValidityPeriod(now - 3600000, now - 1800000) });
  const profile = await CaProfile.build({
    prefix: new Name("/root/authority"),
    info: "authority CA",
    probeKeys: [],
    maxValidityPeriod: 86400000,
    cert: caCert,
    signer: caPvt,
    version: 7,
  });

  const reqSIP = crypto.makeSignedInterestPolicy();
  const [reqPvt, reqPub] = await generateSigningKey("/requester");
  const [, reqEcdhPub] = await crypto.generateEcdhKey();
  await expect(NewRequest.build({
    profile,
    signedInterestPolicy: reqSIP,
    ecdhPub: reqEcdhPub,
    publicKey: reqPub,
    privateKey: reqPvt,
  })).rejects.toThrow(/ValidityPeriod/);
});
