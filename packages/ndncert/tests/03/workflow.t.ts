import { Certificate, EcPrivateKey, RsaPrivateKey } from "@ndn/keychain";
import { Name } from "@ndn/packet";
import { PrefixRegShorter, RepoProducer } from "@ndn/repo";
import { makeEmptyDataStore } from "@ndn/repo/test-fixture/data-store";

import { CaProfile, ClientChallenge, ClientNopChallenge, ClientPinChallenge, requestCertificate, Server, ServerChallenge, ServerNopChallenge, ServerPinChallenge } from "../..";

interface Row {
  makeChallengeLists: () => [ServerChallenge[], ClientChallenge[]];
  clientShouldFail?: boolean;
}

const TABLE: Row[] = [
  {
    makeChallengeLists() {
      return [
        [new ServerNopChallenge()],
        [new ClientNopChallenge()],
      ];
    },
  },
  {
    makeChallengeLists() {
      let lastPin = "";
      const serverPin = new ServerPinChallenge();
      serverPin.on("newpin", (requestId, pin) => lastPin = pin);
      const clientPin = new ClientPinChallenge(() => Promise.resolve(lastPin));
      return [
        [serverPin],
        [clientPin],
      ];
    },
  },
  {
    makeChallengeLists() {
      return [
        [new ServerPinChallenge()],
        [new ClientPinChallenge(() => Promise.resolve("000000"))],
      ];
    },
    clientShouldFail: true,
  },
  {
    makeChallengeLists() {
      return [
        [new ServerPinChallenge()],
        [new ClientNopChallenge()],
      ];
    },
    clientShouldFail: true,
  },
];

test.each(TABLE)("workflow %#", async ({
  makeChallengeLists,
  clientShouldFail = false,
}) => {
  const repo = makeEmptyDataStore();
  const repoProducer = RepoProducer.create(repo, { reg: PrefixRegShorter(2) });

  const [caPvt, caPub] = await RsaPrivateKey.generate("/authority");
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

  const [serverChallenges, reqChallenges] = makeChallengeLists();

  const server = Server.create({
    profile,
    repo,
    key: caPvt,
    challenges: serverChallenges,
  });

  const [reqPvt, reqPub] = await EcPrivateKey.generate("/requester");
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
