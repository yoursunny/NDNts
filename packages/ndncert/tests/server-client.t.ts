import "@ndn/packet/test-fixture/expect";

import { Endpoint } from "@ndn/endpoint";
import { type NamedSigner, type NamedVerifier, Certificate, CertNaming, generateSigningKey, ValidityPeriod } from "@ndn/keychain";
import { Component, FwHint, Name } from "@ndn/packet";
import { type DataStore, PrefixRegStatic, RepoProducer } from "@ndn/repo";
import { makeDataStore } from "@ndn/repo/test-fixture/data-store";
import { delay, toHex, toUtf8 } from "@ndn/util";
import { type SentMessageInfo, createTransport as createMT } from "nodemailer";
import { afterEach, beforeAll, beforeEach, expect, test, vi } from "vitest";

import { type ClientChallenge, type ClientChallengeContext, type ParameterKV, type ServerChallenge, type ServerOptions, CaProfile, ClientEmailChallenge, ClientNopChallenge, ClientPinChallenge, ClientPossessionChallenge, ErrorMsg, exportClientConf, importClientConf, requestCertificate, requestProbe, retrieveCaProfile, Server, ServerEmailChallenge, ServerNopChallenge, ServerPinChallenge, ServerPossessionChallenge } from "..";

interface Row {
  summary: string;
  makeChallengeLists: () => Promise<[ServerChallenge[], ClientChallenge[]]>;
  clientShouldFail?: boolean;
}

function makePinChallengeWithWrongInputs(nWrongInputs = 0): Row["makeChallengeLists"] {
  return async () => {
    let lastPin = "";
    const server = new ServerPinChallenge();
    server.on("newpin", (requestId, pin) => lastPin = pin);

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
      const emailsent = vi.fn<[Uint8Array, SentMessageInfo], void>();
      const emailerror = vi.fn<[Uint8Array, Error], void>();
      const server = new ServerEmailChallenge({
        mail: createMT({ jsonTransport: true }),
        template: emailTemplate,
        assignmentPolicy: async (newSubjectName: Name, email: string) => {
          expect(newSubjectName).toEqualName("/requester");
          expect(email).toBe("user@example.com");
        },
      });
      server.on("emailsent", emailsent);
      server.on("emailerror", emailerror);
      return [
        [server],
        [new ClientEmailChallenge("user@example.com", async (context: ClientChallengeContext) => {
          expect(emailerror).not.toHaveBeenCalled();
          expect(emailsent).toHaveBeenCalledTimes(1);
          const [sentRequestId, { envelope, message }] = emailsent.mock.calls[0]!;
          expect(sentRequestId).toEqualUint8Array(context.requestId);
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
let profile: CaProfile;
let reqPvt: NamedSigner.PrivateKey;
let reqPub: NamedVerifier.PublicKey;
beforeAll(async () => {
  [caPvt, caPub] = await generateSigningKey("/authority");
  caCert = await Certificate.selfSign({ privateKey: caPvt, publicKey: caPub });
  profile = await CaProfile.build({
    prefix: new Name("/authority"),
    info: "authority\nCA",
    probeKeys: ["uid"],
    maxValidityPeriod: 86400000,
    cert: caCert,
    signer: caPvt,
    version: 7,
  });
  [reqPvt, reqPub] = await generateSigningKey("/requester");
});

let repo: DataStore;
let repoFwHint: FwHint;
let repoProducer: RepoProducer;
let server: Server;
beforeEach(async () => {
  repo = await makeDataStore();
  const fwName = new Name("/fh");
  repoFwHint = new FwHint(fwName);
  repoProducer = RepoProducer.create(repo, { reg: PrefixRegStatic(fwName) });
});
afterEach(async () => {
  server?.close();
  repoProducer.close();
  await repo.close();
  Endpoint.deleteDefaultForwarder();
});

function startServer(opts: Partial<ServerOptions> = {}): Server {
  server = Server.create({
    profile,
    repo,
    repoFwHint,
    signer: caPvt.withKeyLocator(caCert.name),
    challenges: [new ServerNopChallenge()],
    ...opts,
  });
  return server;
}

function checkCaProfile(retrieved: CaProfile) {
  expect(retrieved.data).toHaveName(profile.data.name);
  expect(retrieved.certDigest).toEqual(profile.certDigest);
  expect(retrieved.toString()).toContain("\n  authority\n  CA\n");
}

test("INFO command", async () => {
  startServer();

  const retrieved = await retrieveCaProfile({
    caPrefix: new Name("/authority"),
    caCertFullName: await caCert.data.computeFullName(),
  });
  checkCaProfile(retrieved);

  const conf = exportClientConf(profile);
  const imported = await importClientConf(conf);
  checkCaProfile(imported);

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
    profile,
    parameters: { uid: toUtf8("my-uid") },
  })).rejects.toThrow();
});

test("probe simple", async () => {
  startServer({
    async probe(parameters: ParameterKV) {
      expect(parameters.uid).toEqualUint8Array(toUtf8("my-uid"));
      return {
        entries: [
          { prefix: new Name("/client/prefix"), maxSuffixLength: 2 },
        ],
      };
    },
  });

  const { entries, redirects } = await requestProbe({
    profile,
    parameters: { uid: toUtf8("my-uid") },
  });
  expect(entries).toHaveLength(1);
  expect(entries[0]!.prefix).toEqualName("/client/prefix");
  expect(entries[0]!.maxSuffixLength).toBe(2);
  expect(redirects).toHaveLength(0);
});

test.each(TABLE)("challenge %j", async ({
  makeChallengeLists,
  clientShouldFail = false,
}) => {
  const [serverChallenges, reqChallenges] = await makeChallengeLists();
  startServer({ challenges: serverChallenges });

  const reqPromise = requestCertificate({
    profile,
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
