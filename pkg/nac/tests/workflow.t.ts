import "@ndn/packet/test-fixture/expect";

import { consume, produce } from "@ndn/endpoint";
import { Certificate, generateEncryptionKey, generateSigningKey, RSAOAEP } from "@ndn/keychain";
import { Bridge } from "@ndn/l3face";
import { Component, Data, Name, ValidityPeriod, type Verifier } from "@ndn/packet";
import { PrefixRegStatic } from "@ndn/repo";
import { makeRepoProducer } from "@ndn/repo/test-fixture/producer";
import { Closers } from "@ndn/util";
import { expect, test } from "vitest";

import { AccessManager, Consumer, Producer } from "..";

test("simple", { timeout: 10000 }, async () => {
  using closers = new Closers();
  const star = Bridge.star({ leaves: 3 }); // 0=AccessManager, 1=Producer, 2=Consumer
  closers.push(...star);

  const [rootSigner, rootVerifier] = await generateSigningKey("/root");

  const amName = new Name("/access/manager");
  const amR = await makeRepoProducer({
    pOpts: { fw: star[0]!.fwB },
    reg: PrefixRegStatic(amName),
  });
  closers.push(amR);
  const [amSigner, amVerifier] = await generateSigningKey(amName);
  const [amOwnKdkEncrypter, amOwnKdkDecrypter] = await generateEncryptionKey(amName.append("kdk-encrypt"), RSAOAEP);
  const am = AccessManager.create({
    cOpts: { fw: star[0]!.fwB },
    dataStore: amR.store,
    prefix: amName,
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
  await expect(am.lookupKek(new Name("/data/part2"))).rejects.toThrow(/KEK not found/);
  const kekHlookup = await am.lookupKek(new Name("/data/part1"));
  expect(kekHlookup.kek).toHaveName(kek.name);

  const pR = await makeRepoProducer({
    pOpts: { fw: star[1]!.fwB },
    reg: PrefixRegStatic(new Name("/producer/ck-prefix")),
  });
  closers.push(pR);
  const [pSigner, pVerifier] = await generateSigningKey("/producer");
  const p = Producer.create({
    dataStore: pR.store,
    ckPrefix: new Name("/producer/ck-prefix"),
    signer: pSigner,
  });
  const pEncrypter = await p.createEncrypter(kek);

  const appContent = crypto.getRandomValues(new Uint8Array(75));
  const pP = produce("/data", async (interest) => {
    const data = new Data(interest.name, appContent);
    await pEncrypter.encrypt(data);
    return data;
  }, { fw: star[1]!.fwB, dataSigner: pSigner });
  closers.push(pP);

  const [cEncrypter, cDecrypter] = await generateEncryptionKey("/consumer", RSAOAEP);
  const cCert = await Certificate.issue({
    validity: ValidityPeriod.daysFromNow(1),
    issuerId: Component.from("rsa"),
    issuerPrivateKey: rootSigner,
    publicKey: cEncrypter,
  });
  const cR = await makeRepoProducer({
    pOpts: { fw: star[2]!.fwB },
    reg: PrefixRegStatic(new Name("/consumer")),
  }, [cCert.data]);
  closers.push(cR);

  const c = Consumer.create({
    cOpts: {
      fw: star[2]!.fwB,
      modifyInterest: { lifetime: 100 }, // allow failed CK retrieval timeout faster
    },
    verifier: {
      verify(pkt: Verifier.Verifiable) {
        if (amName.isPrefixOf(pkt.name)) {
          return amVerifier.verify(pkt);
        }
        return pVerifier.verify(pkt);
      },
    },
    memberDecrypter: cDecrypter,
  });
  const appData = await consume("/data/part1/packet0", {
    fw: star[2]!.fwB,
    verifier: pVerifier,
  });
  expect(appData.content).not.toEqualUint8Array(appContent);
  await expect(c.decrypt(appData)).rejects.toThrow(/expire/);

  await kekH.grant(cCert.name);
  await c.decrypt(appData);
  expect(appData.content).toEqualUint8Array(appContent);
});
