import "@ndn/packet/test-fixture/expect";

import { Endpoint } from "@ndn/endpoint";
import { Certificate, generateEncryptionKey, generateSigningKey, KeyChainImplWebCrypto as crypto, RSAOAEP, ValidityPeriod } from "@ndn/keychain";
import { Component, Data, Name, Verifier } from "@ndn/packet";
import { PrefixRegStatic } from "@ndn/repo";
import { makeRepoProducer } from "@ndn/repo/test-fixture/data-store";

import { AccessManager, Consumer, Producer } from "..";

afterEach(() => Endpoint.deleteDefaultForwarder());

test("simple", async () => {
  const [rootSigner, rootVerifier] = await generateSigningKey("/root");

  const amE = new Endpoint();
  const { store: amStore, close: amClose } = await makeRepoProducer([], {
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
  const { store: pStore, close: pClose } = await makeRepoProducer([], {
    endpoint: pE,
    reg: PrefixRegStatic(new Name("/producer/ck-prefix")),
  });
  const [pSigner, pVerifier] = await generateSigningKey("/producer");
  const p = Producer.create({
    dataStore: pStore,
    ckPrefix: new Name("/producer/ck-prefix"),
    signer: pSigner,
  });
  const pEncrypter = await p.createEncrypter(kek);

  const appContent = crypto.getRandomValues(new Uint8Array(75));
  const pP = pE.produce("/data", async (interest) => {
    const data = new Data(interest.name, appContent);
    await pEncrypter.encrypt(data);
    return data;
  }, { dataSigner: pSigner });

  const cE = new Endpoint();
  const { store: cStore, close: cClose } = await makeRepoProducer([], {
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
  const appData = await cE.consume("/data/part1/packet0", { verifier: pVerifier });
  expect(appData.content).not.toEqualUint8Array(appContent);
  await expect(c.decrypt(appData)).rejects.toThrow();

  await kekH.grant(cCert.name);
  await expect(c.decrypt(appData)).resolves.toBeUndefined();
  expect(appData.content).toEqualUint8Array(appContent);

  pP.close();
  cClose();
  pClose();
  amClose();
}, 10000);
