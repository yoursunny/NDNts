import "@ndn/packet/test-fixture/expect";

import { Endpoint } from "@ndn/endpoint";
import { Certificate, CertNaming, generateSigningKey, type NamedSigner, type NamedVerifier, ValidityPeriod } from "@ndn/keychain";
import { Component, FwHint, Name, type Signer } from "@ndn/packet";
import { type DataStore, PrefixRegStatic, RepoProducer } from "@ndn/repo";
import { makeDataStore } from "@ndn/repo/test-fixture/data-store";
import { Closers, delay, toHex, toUtf8 } from "@ndn/util";
import { createTransport as createMT, type SentMessageInfo } from "nodemailer";
import { beforeAll, beforeEach, expect, test, vi } from "vitest";

import { CaProfile, type ClientChallenge, type ClientChallengeContext, ClientEmailChallenge, ClientNopChallenge, ClientPinChallenge, ClientPossessionChallenge, ErrorMsg, exportClientConf, importClientConf, type ParameterKV, requestCertificate, requestProbe, retrieveCaProfile, Server, type ServerChallenge, ServerEmailChallenge, ServerNopChallenge, type ServerOptions, ServerPinChallenge, ServerPossessionChallenge } from "..";

interface Row {
  summary: string;
  makeChallengeLists(): Promise<[ServerChallenge[], ClientChallenge[]]>;
  clientShouldFail?: boolean;
}

function makePinChallengeWithWrongInputs(nWrongInputs = 0): Row["makeChallengeLists"] {
  return async () => {
    let lastPin = "";
    const server = new ServerPinChallenge();
    server.addEventListener("newpin", ({ pin }) => { lastPin = pin; });

    let nPrompts = 0;
    const client = new ClientPinChallenge(async () => {
      await delay(100 * Math.random());
      if (++nPrompts <= nWrongInputs) {
        return `x${lastPin}`;
      }
      return lastPin;
    });

    return [
      [server],
      [client],
    ];
  };
}

async function preparePossessionChallenge(validity = ValidityPeriod.daysFromNow(1)): Promise<{
  rootPvt: NamedSigner.PrivateKey;
  rootPub: NamedVerifier.PublicKey;
  clientPvt: NamedSigner.PrivateKey;
  clientPub: NamedVerifier.PublicKey;
  clientCert: Certificate;
}> {
  const [rootPvt, rootPub] = await generateSigningKey("/root");
  const [clientPvt, clientPub] = await generateSigningKey("/requester");
  const clientCert = await Certificate.issue({
    validity,
    issuerId: Component.from("root"),
    issuerPrivateKey: rootPvt,
    publicKey: clientPub,
  });
  return { rootPvt, rootPub, clientPvt, clientPub, clientCert };
}

const emailTemplate: ServerEmailChallenge.Template = {
  from: "ca@example.com",
  subject: "NDNCERT $caPrefix$ email challenge for $requestId$",
  text: "$subjectName$\n$keyName$\n$pin$\n$pin$",
};

const TABLE: Row[] = [
  {
    summary: "nop",
    async makeChallengeLists() {
      return [
        [new ServerNopChallenge()],
        [new ClientNopChallenge()],
      ];
    },
  },
  {
    summary: "pin, success",
    makeChallengeLists: makePinChallengeWithWrongInputs(0),
  },
  {
    summary: "pin, success after 2 wrong inputs",
    makeChallengeLists: makePinChallengeWithWrongInputs(2),
  },
  {
    summary: "pin, exceed retry limit after 3 wrong inputs",
    makeChallengeLists: makePinChallengeWithWrongInputs(3),
    clientShouldFail: true,
  },
  {
    summary: "email, success",
    async makeChallengeLists() {
      const emailsent = vi.fn<[ServerEmailChallenge.SentEvent], void>();
      const emailerror = vi.fn<[ServerEmailChallenge.ErrorEvent], void>();
      const server = new ServerEmailChallenge({
        mail: createMT({ jsonTransport: true }),
        template: emailTemplate,
        assignmentPolicy: async (newSubjectName: Name, email: string) => {
          expect(newSubjectName).toEqualName("/requester");
          expect(email).toBe("user@example.com");
        },
      });
      server.addEventListener("emailsent", emailsent);
      server.addEventListener("emailerror", emailerror);
      return [
        [server],
        [new ClientEmailChallenge("user@example.com", async (context: ClientChallengeContext) => {
          expect(emailerror).not.toHaveBeenCalled();
          expect(emailsent).toHaveBeenCalledTimes(1);
          const { requestId, sent: { envelope, message } } = emailsent.mock.calls[0]![0];
          expect(requestId).toEqualUint8Array(context.requestId);
          expect(envelope.from).toBe("ca@example.com");
          expect(envelope.to).toStrictEqual(["user@example.com"]);
          const msg = JSON.parse(message);
          expect(msg.subject).toBe(`NDNCERT /authority email challenge for ${toHex(context.requestId)}`);
          const lines = msg.text.split("\n");
          expect(lines).toHaveLength(4);
          expect(new Name(lines[0])).toEqualName("/requester");
          expect(CertNaming.isKeyName(new Name(lines[1]))).toBeTruthy();
          expect(lines[2]).toBe(lines[3]);
          return lines[2];
        })],
      ];
    },
  },
  {
    summary: "email, wrong code",
    async makeChallengeLists() {
      const server = new ServerEmailChallenge({
        mail: createMT({ jsonTransport: true }),
        template: emailTemplate,
      });
      return [
        [server],
        [new ClientEmailChallenge("", async () => "0000")],
      ];
    },
    clientShouldFail: true,
  },
  {
    summary: "email, reject in assignment policy",
    async makeChallengeLists() {
      const server = new ServerEmailChallenge({
        mail: createMT({ jsonTransport: true }),
        template: emailTemplate,
        assignmentPolicy: async () => { throw new Error("no-assignment"); },
      });
      return [
        [server],
        [new ClientEmailChallenge("user@example.com", async () => "0000")],
      ];
    },
    clientShouldFail: true,
  },
  {
    summary: "possession, success without assignment policy",
    async makeChallengeLists() {
      const { rootPub, clientCert, clientPvt } = await preparePossessionChallenge();
      return [
        [new ServerPossessionChallenge(rootPub)],
        [new ClientPossessionChallenge(clientCert, clientPvt)],
      ];
    },
  },
  {
    summary: "possession, accept in assignment policy",
    async makeChallengeLists() {
      const { rootPub, clientCert, clientPvt } = await preparePossessionChallenge();
      return [
        [new ServerPossessionChallenge(rootPub, async (newSubjectName, oldCert) => {
          expect(newSubjectName).toEqualName("/requester");
          expect(oldCert).toHaveName(clientCert.name);
        })],
        [new ClientPossessionChallenge(clientCert, clientPvt)],
      ];
    },
  },
  {
    summary: "possession, reject in assignment policy",
    async makeChallengeLists() {
      const { rootPub, clientCert, clientPvt } = await preparePossessionChallenge();
      return [
        [new ServerPossessionChallenge(rootPub, () => Promise.reject(new Error("no-assign")))],
        [new ClientPossessionChallenge(clientCert, clientPvt)],
      ];
    },
    clientShouldFail: true,
  },
  {
    summary: "possession, bad signature",
    async makeChallengeLists() {
      const { rootPub, clientCert } = await preparePossessionChallenge();
      return [
        [new ServerPossessionChallenge(rootPub)],
        [new ClientPossessionChallenge(clientCert, async () => Uint8Array.of(0xBB))],
      ];
    },
    clientShouldFail: true,
  },
  {
    summary: "possession, bad certificate encoding",
    async makeChallengeLists() {
      const { rootPub, clientCert, clientPvt } = await preparePossessionChallenge();
      vi.spyOn(clientCert.data, "encodeTo")
        .mockImplementation((encoder) => encoder.encode(Uint8Array.of(0xDD)));
      return [
        [new ServerPossessionChallenge(rootPub)],
        [new ClientPossessionChallenge(clientCert, clientPvt)],
      ];
    },
    clientShouldFail: true,
  },
  {
    summary: "possession, expired certificate",
    async makeChallengeLists() {
      const now = Date.now();
      const { rootPub, clientCert, clientPvt } =
        await preparePossessionChallenge(new ValidityPeriod(now - 7200000, now - 3600000));
      return [
        [new ServerPossessionChallenge(rootPub)],
        [new ClientPossessionChallenge(clientCert, clientPvt)],
      ];
    },
    clientShouldFail: true,
  },
  {
    summary: "possession, client certificate not trusted",
    async makeChallengeLists() {
      const { rootPub, clientPvt, clientPub } = await preparePossessionChallenge();
      const clientSelfCert = await Certificate.selfSign({ privateKey: clientPvt, publicKey: clientPub });
      return [
        [new ServerPossessionChallenge(rootPub)],
        [new ClientPossessionChallenge(clientSelfCert, clientPvt)],
      ];
    },
    clientShouldFail: true,
  },
  {
    summary: "server challenge not acceptable on client",
    async makeChallengeLists() {
      return [
        [new ServerPinChallenge()],
        [new ClientNopChallenge()],
      ];
    },
    clientShouldFail: true,
  },
];

let caPvt: NamedSigner.PrivateKey;
let caPub: NamedVerifier.PublicKey;
let caCert: Certificate;
let caSigner: Signer;
let caProfile: CaProfile;
let subPvt: NamedSigner.PrivateKey;
let subPub: NamedVerifier.PublicKey;
let subCert: Certificate;
let subSigner: Signer;
let subProfile: CaProfile;
let reqPvt: NamedSigner.PrivateKey;
let reqPub: NamedVerifier.PublicKey;
beforeAll(async () => {
  [caPvt, caPub] = await generateSigningKey("/authority");
  caCert = await Certificate.selfSign({ privateKey: caPvt, publicKey: caPub });
  caSigner = caPvt.withKeyLocator(caCert.name);
  caProfile = await CaProfile.build({
    prefix: new Name("/authority"),
    info: "authority\nCA",
    probeKeys: ["uid"],
    maxValidityPeriod: 86400000,
    cert: caCert,
    signer: caSigner,
    version: 7,
  });

  [subPvt, subPub] = await generateSigningKey("/sub");
  subCert = await Certificate.issue({
    validity: ValidityPeriod.daysFromNow(2),
    issuerId: Component.from("hierarchy"),
    issuerPrivateKey: caPvt,
    publicKey: subPub,
  });
  subSigner = subPvt.withKeyLocator(subCert.name);
  subProfile = await CaProfile.build({
    prefix: new Name("/sub"),
    info: "sub_CA",
    probeKeys: [],
    maxValidityPeriod: 2592000000,
    cert: subCert,
    signer: subSigner,
  });

  [reqPvt, reqPub] = await generateSigningKey("/requester");
});

const closers = new Closers();
let repo: DataStore;
let repoFwHint: FwHint;
beforeEach(async () => {
  repo = await makeDataStore();
  const fwName = new Name("/fh");
  repoFwHint = new FwHint(fwName);
  const repoProducer = RepoProducer.create(repo, { reg: PrefixRegStatic(fwName) });
  closers.push(repo, repoProducer);
  return () => {
    closers.close();
    Endpoint.deleteDefaultForwarder();
  };
});

function startServer(opts: Partial<ServerOptions> = {}): Server {
  const server = Server.create({
    profile: caProfile,
    repo,
    repoFwHint,
    signer: caSigner,
    challenges: [new ServerNopChallenge()],
    ...opts,
  });
  closers.push(server);
  return server;
}

function checkCaProfile(retrieved: CaProfile, expected: CaProfile, stringContains = "\n  authority\n  CA\n") {
  expect(retrieved.data).toHaveName(expected.data.name);
  expect(retrieved.certDigest).toEqual(expected.certDigest);
  expect(retrieved.toString()).toContain(stringContains);
}

test("INFO command", async () => {
  startServer();

  const retrieved = await retrieveCaProfile({
    caPrefix: new Name("/authority"),
    caCertFullName: await caCert.data.computeFullName(),
  });
  checkCaProfile(retrieved, caProfile);

  const conf = exportClientConf(caProfile);
  const imported = await importClientConf(conf);
  checkCaProfile(imported, caProfile);

  delete (conf["ca-list"][0] as any).certificate;
  await expect(importClientConf(conf)).rejects.toThrow();
});

test("unsupported or malformed commands", async () => {
  startServer();

  const endpoint = new Endpoint();
  const [probeErr, newErr, challengeErr] = await Promise.all([
    endpoint.consume("/authority/CA/PROBE"),
    endpoint.consume("/authority/CA/NEW"),
    endpoint.consume("/authority/CA/CHALLENGE"),
  ]);
  expect(() => ErrorMsg.throwOnError(probeErr)).toThrow();
  expect(() => ErrorMsg.throwOnError(newErr)).toThrow();
  expect(() => ErrorMsg.throwOnError(challengeErr)).toThrow();
});

test("probe no result", async () => {
  startServer({ async probe() { return {}; } });

  await expect(requestProbe({
    profile: caProfile,
    parameters: { uid: toUtf8("my-uid") },
  })).rejects.toThrow();
});

test("probe mismatch", async () => {
  startServer({
    async probe() { expect.fail("unexpected server probe"); },
  });

  await expect(requestProbe({
    profile: caProfile,
    parameters: { user: new Uint8Array(2) },
  })).rejects.toThrow();
});

test("probe entries and redirects", async () => {
  const subCertFullName = await subCert.data.computeFullName();
  startServer({
    async probe(parameters: ParameterKV) {
      expect(parameters.uid).toEqualUint8Array(toUtf8("my-uid"));
      return {
        entries: [
          { prefix: new Name("/client/prefix2"), maxSuffixLength: 2 },
          { prefix: new Name("/client/prefix0") },
        ],
        redirects: [
          { caCertFullName: subCertFullName },
        ],
      };
    },
  });

  const { entries, redirects } = await requestProbe({
    profile: caProfile,
    parameters: { uid: toUtf8("my-uid") },
  });
  expect(entries).toHaveLength(2);
  expect(entries[0]!.prefix).toEqualName("/client/prefix2");
  expect(entries[0]!.maxSuffixLength).toBe(2);
  expect(entries[1]!.prefix).toEqualName("/client/prefix0");
  expect(entries[1]!.maxSuffixLength).toBeUndefined();
  expect(redirects).toHaveLength(1);
  expect(redirects[0]!.caCertFullName).toEqualName(subCertFullName);

  await expect(retrieveCaProfile({
    endpoint: new Endpoint({
      retx: 0,
      modifyInterest: { lifetime: 100 },
    }),
    caCertFullName: redirects[0]!.caCertFullName,
  })).rejects.toThrow();
  startServer({
    profile: subProfile,
    signer: subSigner,
  });

  const retrieved = await retrieveCaProfile({
    caCertFullName: redirects[0]!.caCertFullName,
  });
  checkCaProfile(retrieved, subProfile, "sub_CA");
});

test.each(TABLE)("challenge %j", async ({
  makeChallengeLists,
  clientShouldFail = false,
}) => {
  const [serverChallenges, reqChallenges] = await makeChallengeLists();
  startServer({ challenges: serverChallenges });

  const reqPromise = requestCertificate({
    profile: caProfile,
    privateKey: reqPvt,
    publicKey: reqPub,
    challenges: reqChallenges,
  });
  if (clientShouldFail) {
    await expect(reqPromise).rejects.toThrow();
  } else {
    await expect(reqPromise).resolves.toBeInstanceOf(Certificate);
  }
});
