import { Certificate, ECDSA, generateSigningKey, NamedSigner, NamedVerifier, RSA, ValidityPeriod } from "@ndn/keychain";
import { Component, Name } from "@ndn/packet";
import { PrefixRegShorter, RepoProducer } from "@ndn/repo";
import { makeDataStore } from "@ndn/repo/test-fixture/data-store";

import { CaProfile, ClientChallenge, ClientNopChallenge, ClientPinChallenge, ClientPossessionChallenge, requestCertificate, Server, ServerChallenge, ServerNopChallenge, ServerPinChallenge, ServerPossessionChallenge } from "../..";

interface Row {
  makeChallengeLists: () => Promise<[ServerChallenge[], ClientChallenge[]]>;
  clientShouldFail?: boolean;
}

function makePinChallengeWithWrongInputs(nWrongInputs = 0): Row["makeChallengeLists"] {
  return async () => {
    let lastPin = "";
    const serverPin = new ServerPinChallenge();
    serverPin.on("newpin", (requestId, pin) => lastPin = pin);

    let nPrompts = 0;
    const clientPin = new ClientPinChallenge(async () => {
      await new Promise((r) => setTimeout(r, 100 * Math.random()));
      if (++nPrompts <= nWrongInputs) {
        return `x${lastPin}`;
      }
      return lastPin;
    });

    return [
      [serverPin],
      [clientPin],
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
      const { rootPub, clientCert, clientPvt } = await preparePossessionChallenge();
      return [
        [new ServerPossessionChallenge(rootPub)],
        [new ClientPossessionChallenge(clientCert, clientPvt)],
      ];
    },
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
      const now = Date.now();
      const { rootPub, clientCert, clientPvt } =
        await preparePossessionChallenge(new ValidityPeriod(now - 7200000, now - 3600000));
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

test.each(TABLE)("workflow %#", async ({
  makeChallengeLists,
  clientShouldFail = false,
}) => {
  const repo = await makeDataStore();
  const repoProducer = RepoProducer.create(repo, { reg: PrefixRegShorter(2) });

  const [caPvt, caPub] = await generateSigningKey("/authority", RSA);
  const caCert = await Certificate.selfSign({ privateKey: caPvt, publicKey: caPub });
  const profile = await CaProfile.build({
    prefix: new Name("/authority/CA"),
    info: "authority CA",
    probeKeys: ["uid"],
    maxValidityPeriod: 86400000,
    cert: caCert,
    signer: caPvt,
    version: 7,
  });

  const [serverChallenges, reqChallenges] = await makeChallengeLists();

  const server = Server.create({
    profile,
    repo,
    key: caPvt,
    challenges: serverChallenges,
  });

  const [reqPvt, reqPub] = await generateSigningKey("/requester", ECDSA);
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

  server.close();
  repoProducer.close();
  await repo.close();
});
