import "@ndn/packet/test-fixture/expect";

import { Endpoint } from "@ndn/endpoint";
import { Certificate, CertNaming, ECDSA, generateSigningKey, NamedSigner, NamedVerifier, RSA, ValidityPeriod } from "@ndn/keychain";
import { Component, FwHint, Name } from "@ndn/packet";
import { retrieveMetadata } from "@ndn/rdr";
import { DataStore, PrefixRegStatic, RepoProducer } from "@ndn/repo";
import { makeDataStore } from "@ndn/repo/test-fixture/data-store";
import { fetch } from "@ndn/segmented-object";
import { toHex } from "@ndn/tlv";
import { createTransport as createMT, SentMessageInfo } from "nodemailer";
import { collect } from "streaming-iterables";

import { CaProfile, ClientChallenge, ClientChallengeContext, ClientEmailChallenge, ClientNopChallenge, ClientPinChallenge, ClientPossessionChallenge, ErrorMsg, requestCertificate, Server, ServerChallenge, ServerEmailChallenge, ServerNopChallenge, ServerPinChallenge, ServerPossessionChallenge } from "../..";

interface Row {
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
      await new Promise((r) => setTimeout(r, 100 * Math.random()));
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
    async makeChallengeLists() {
      return [
        [new ServerNopChallenge()],
        [new ClientNopChallenge()],
      ];
    },
  },
  {
    makeChallengeLists: makePinChallengeWithWrongInputs(0),
  },
  {
    makeChallengeLists: makePinChallengeWithWrongInputs(2),
  },
  {
    makeChallengeLists: makePinChallengeWithWrongInputs(3),
    clientShouldFail: true, // exceed retry limit
  },
  {
    async makeChallengeLists() {
      const emailsent = jest.fn<void, [Uint8Array, SentMessageInfo]>();
      const emailerror = jest.fn<void, [Uint8Array, Error]>();
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
    async makeChallengeLists() {
      const { rootPub, clientCert, clientPvt } = await preparePossessionChallenge();
      return [
        [new ServerPossessionChallenge(rootPub)], // assignment policy not specified
        [new ClientPossessionChallenge(clientCert, clientPvt)],
      ];
    },
  },
  {
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
    async makeChallengeLists() {
      const { rootPub, clientCert, clientPvt } = await preparePossessionChallenge();
      return [
        [new ServerPossessionChallenge(rootPub, () => Promise.reject(new Error("no-assign")))],
        [new ClientPossessionChallenge(clientCert, clientPvt)],
      ];
    },
    clientShouldFail: true, // assignment policy rejects
  },
  {
    async makeChallengeLists() {
      const { rootPub, clientCert } = await preparePossessionChallenge();
      return [
        [new ServerPossessionChallenge(rootPub)],
        [new ClientPossessionChallenge(clientCert, async () => Uint8Array.of(0xBB))],
      ];
    },
    clientShouldFail: true, // bad signature
  },
  {
    async makeChallengeLists() {
      const { rootPub, clientCert, clientPvt } = await preparePossessionChallenge();
      jest.spyOn(clientCert.data, "encodeTo")
        .mockImplementation((encoder) => encoder.prependValue(Uint8Array.of(0xDD)));
      return [
        [new ServerPossessionChallenge(rootPub)],
        [new ClientPossessionChallenge(clientCert, clientPvt)],
      ];
    },
    clientShouldFail: true, // bad certificate encoding
  },
  {
    async makeChallengeLists() {
      const now = Date.now();
      const { rootPub, clientCert, clientPvt } =
        await preparePossessionChallenge(new ValidityPeriod(now - 7200000, now - 3600000));
      return [
        [new ServerPossessionChallenge(rootPub)],
        [new ClientPossessionChallenge(clientCert, clientPvt)],
      ];
    },
    clientShouldFail: true, // expired certificate
  },
  {
    async makeChallengeLists() {
      const { rootPub, clientPvt, clientPub } = await preparePossessionChallenge();
      const clientSelfCert = await Certificate.selfSign({ privateKey: clientPvt, publicKey: clientPub });
      return [
        [new ServerPossessionChallenge(rootPub)],
        [new ClientPossessionChallenge(clientSelfCert, clientPvt)],
      ];
    },
    clientShouldFail: true, // client certificate not trusted
  },
  {
    async makeChallengeLists() {
      return [
        [new ServerPinChallenge()],
        [new ClientNopChallenge()],
      ];
    },
    clientShouldFail: true, // server challenge not acceptable on client
  },
];

let caPvt: NamedSigner.PrivateKey;
let caPub: NamedVerifier.PublicKey;
let caCert: Certificate;
let profile: CaProfile;
let reqPvt: NamedSigner.PrivateKey;
let reqPub: NamedVerifier.PublicKey;
beforeAll(async () => {
  [caPvt, caPub] = await generateSigningKey("/authority", RSA);
  caCert = await Certificate.selfSign({ privateKey: caPvt, publicKey: caPub });
  profile = await CaProfile.build({
    prefix: new Name("/authority"),
    info: "authority CA",
    probeKeys: ["uid"],
    maxValidityPeriod: 86400000,
    cert: caCert,
    signer: caPvt,
    version: 7,
  });
  [reqPvt, reqPub] = await generateSigningKey("/requester", ECDSA);
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

function startServer(challenges: readonly ServerChallenge[] = [new ServerNopChallenge()]): Server {
  server = Server.create({
    profile,
    repo,
    repoFwHint,
    signer: caPvt.withKeyLocator(caCert.name),
    challenges,
  });
  return server;
}

test("INFO command", async () => {
  startServer();

  const metadata = await retrieveMetadata("/authority/CA/INFO", { verifier: caPub });
  const dataPkts = await collect(fetch(metadata.name, { verifier: caPub }));
  expect(dataPkts).toHaveLength(1);
  expect(dataPkts[0]).toHaveName(profile.data.name);

  const parsed = await CaProfile.fromData(dataPkts[0]!);
  expect(parsed.certDigest).toEqual(profile.certDigest);
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

test.each(TABLE)("challenge %#", async ({
  makeChallengeLists,
  clientShouldFail = false,
}) => {
  const [serverChallenges, reqChallenges] = await makeChallengeLists();
  startServer(serverChallenges);

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
