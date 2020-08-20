import "@ndn/packet/test-fixture/expect";

import { Endpoint } from "@ndn/endpoint";
import { Certificate, generateEncryptionKey, generateSigningKey, KeyChainImplWebCrypto as crypto, RSAOAEP, ValidityPeriod } from "@ndn/keychain";
import { Component, Data, Interest, Name, Verifier } from "@ndn/packet";
import { DataStore, PrefixRegStatic, RepoProducer } from "@ndn/repo";
import memdown from "memdown";

import { AccessManager, Consumer, Producer } from "..";

afterEach(() => Endpoint.deleteDefaultForwarder());

test("simple", async () => {
  const [rootSigner, rootVerifier] = await generateSigningKey("/root");

  const amE = new Endpoint();
  const amStore = new DataStore(memdown());
  const amRP = RepoProducer.create(amStore, {
    endpoint: amE,
    reg: PrefixRegStatic(new Name("/access/manager")),
  });
  const [amSigner, amVerifier] = await generateSigningKey("/access/manager");
  const [amOwnKdkEncrypter, amOwnKdkDecrypter] = await generateEncryptionKey("/access/manager/kdk-encrypt", RSAOAEP);
  const am = AccessManager.create({
    endpoint: amE,
    dataStore: amStore,
    prefix: new Name("/access/manager"),
    keys: {
      signer: amSigner,
      memberVerifier: rootVerifier,
      ownKdkEncrypter: amOwnKdkEncrypter,
      ownKdkDecrypter: amOwnKdkDecrypter,
      ownKdkVerifier: amVerifier,
    },
  });

  const kekH = await am.createKek(new Name("/data/part1"));
  const kek = kekH.kek;
  await expect(am.lookupKek(new Name("/data/part2"))).rejects.toThrow();
  const kekHlookup = await am.lookupKek(new Name("/data/part1"));
  expect(kekHlookup.kek).toHaveName(kek.name);

  const pE = new Endpoint();
  const pStore = new DataStore(memdown());
  const pRP = RepoProducer.create(pStore, {
    endpoint: pE,
    reg: PrefixRegStatic(new Name("/producer/ck-prefix")),
  });
  const [pSigner, pVerifier] = await generateSigningKey("/producer");
  const p = Producer.create({
    dataStore: pStore,
    ckPrefix: new Name("/producer/ck-prefix"),
    signer: pSigner,
  });

  const appContent = crypto.getRandomValues(new Uint8Array(75));
  const pP = pE.produce("/data", async (interest) => {
    const data = new Data(interest.name, appContent);
    await p.encrypt(kek, data);
    await pSigner.sign(data);
    return data;
  });

  const cE = new Endpoint();
  const cStore = new DataStore(memdown());
  const cRP = RepoProducer.create(cStore, {
    endpoint: cE,
    reg: PrefixRegStatic(new Name("/consumer")),
  });
  const [cEncrypter, cDecrypter] = await generateEncryptionKey("/consumer", RSAOAEP);
  const cCert = await Certificate.issue({
    validity: ValidityPeriod.daysFromNow(1),
    issuerId: Component.from("rsa"),
    issuerPrivateKey: rootSigner,
    publicKey: cEncrypter,
  });
  await cStore.insert(cCert.data);
  const c = Consumer.create({
    endpoint: cE,
    verifier: {
      async verify(pkt: Verifier.Verifiable) {
        if (new Name("/access/manager").isPrefixOf(pkt.name)) {
          return amVerifier.verify(pkt);
        }
        return pVerifier.verify(pkt);
      },
    },
    memberDecrypter: cDecrypter,
  });
  const appData = await cE.consume(new Interest("/data/part1/packet0"), { verifier: pVerifier });
  expect(appData.content).not.toEqualUint8Array(appContent);
  await expect(c.decrypt(appData)).rejects.toThrow();

  await kekH.grant(cCert.name);
  await expect(c.decrypt(appData)).resolves.toBeUndefined();
  expect(appData.content).toEqualUint8Array(appContent);

  pP.close();
  cRP.close();
  pRP.close();
  amRP.close();
}, 10000);
