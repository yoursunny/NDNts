import "@ndn/packet/test-fixture/expect";

import { EventEmitter } from "node:events";

import { Endpoint } from "@ndn/endpoint";
import { Forwarder, type FwFace, FwPacket } from "@ndn/fw";
import { NoopFace } from "@ndn/fw/test-fixture/noop-face";
import { Certificate, generateSigningKey, KeyChain, ValidityPeriod } from "@ndn/keychain";
import { Bridge } from "@ndn/l3face/test-fixture/bridge";
import { Component, Data, Interest, Name, ParamsDigest } from "@ndn/packet";
import { Decoder, Encoder, NNI } from "@ndn/tlv";
import { Closers, delay } from "@ndn/util";
import { afterEach, expect, test } from "vitest";

import { ControlCommand, ControlParameters, ControlResponse, enableNfdPrefixReg } from "..";

const closers = new Closers();
afterEach(closers.close);

interface Row {
  faceIsLocal?: boolean;
  commandPrefix?: Name;
  expectedPrefix: Name;
}

const TABLE: Row[] = [
  {
    faceIsLocal: true,
    expectedPrefix: ControlCommand.localhostPrefix,
  },
  {
    faceIsLocal: false,
    expectedPrefix: ControlCommand.localhopPrefix,
  },
  {
    commandPrefix: new Name("/Q"),
    expectedPrefix: new Name("/Q"),
  },
];

test.each(TABLE)("reg %#", async ({ faceIsLocal, commandPrefix, expectedPrefix }) => {
  const fw = Forwarder.create();
  closers.push(fw);

  const verbs: string[] = [];
  const remoteProcess = (interest: Interest, token: unknown) => {
    expect(interest.name).toHaveLength(expectedPrefix.length + 4);
    expect(interest.name.at(-1).is(ParamsDigest)).toBeTruthy();
    const verb = interest.name.at(-3).text;
    verbs.push(verb);

    const params = new Decoder(interest.name.at(-2).value).decode(ControlParameters);
    expect(params.name).toEqualName("/R");
    expect(params.origin).toBe(65);
    if (verb === "register") {
      expect(params.cost).toBe(0);
      expect(params.flags).toBe(0x02);
    } else {
      expect(params.cost).toBeUndefined();
      expect(params.flags).toBeUndefined();
    }

    const status = [1, 5].includes(verbs.length) ? 400 : 200;
    const data = new Data(interest.name, Encoder.encode(new ControlResponse(status, "", params)));
    return FwPacket.create(data, token);
  };
  const uplinkL3 = new class extends EventEmitter implements FwFace.RxTxDuplex {
    async *duplex(iterable: AsyncIterable<FwPacket>) {
      for await (const { l3, token } of iterable) {
        expect(l3).toBeInstanceOf(Interest);
        yield remoteProcess(l3 as Interest, token);
      }
    }
  }();
  const uplink = fw.addFace(uplinkL3, { local: faceIsLocal });
  closers.push(uplink);
  enableNfdPrefixReg(uplink, {
    commandPrefix,
    retry: {
      minTimeout: 1,
      maxTimeout: 1,
    },
    refreshInterval: 300,
  });

  const appFace = fw.addFace(new NoopFace());
  appFace.addAnnouncement("/R");
  await delay(70);
  expect(verbs).toHaveLength(2);
  expect(verbs[0]).toBe("register"); // status 400
  expect(verbs[1]).toBe("register");

  await delay(330);
  expect(verbs).toHaveLength(3);
  expect(verbs[2]).toBe("register");

  uplinkL3.emit("down");
  await delay(100);
  uplinkL3.emit("up");
  await delay(200);
  expect(verbs).toHaveLength(4);
  expect(verbs[3]).toBe("register");

  appFace.removeAnnouncement("/R");
  await delay(70);
  expect(verbs).toHaveLength(6);
  expect(verbs[4]).toBe("unregister"); // status 400
  expect(verbs[5]).toBe("unregister");

  await delay(330);
  expect(verbs).toHaveLength(6);

  uplinkL3.emit("down");
  await delay(100);
  uplinkL3.emit("up");
  await delay(100);
  expect(verbs).toHaveLength(6);
}, { retry: 3 });

test("preloadCert", async () => {
  const [rootPvt, rootPub] = await generateSigningKey("/root");
  const rootCert = await Certificate.selfSign({
    validity: ValidityPeriod.daysFromNow(90),
    privateKey: rootPvt,
    publicKey: rootPub,
  });
  const [interPvt, interPub] = await generateSigningKey("/root/inter");
  const interCert = await Certificate.issue({
    validity: ValidityPeriod.daysFromNow(60),
    issuerId: Component.from("h"),
    issuerPrivateKey: rootPvt.withKeyLocator(rootCert.name),
    publicKey: interPub,
  });
  const userKeyChain = KeyChain.createTemp();
  const [userPvt, userPub] = await generateSigningKey(userKeyChain, "/root/inter/user");
  const userCert = await Certificate.issue({
    validity: ValidityPeriod.daysFromNow(30),
    issuerId: Component.from("h"),
    issuerPrivateKey: interPvt.withKeyLocator(interCert.name),
    publicKey: userPub,
  });
  await userKeyChain.insertCert(userCert);

  const nfdFw = Forwarder.create();
  const nfdEp = new Endpoint({ fw: nfdFw });
  const interP = new Endpoint({
    fw: nfdFw,
    announcement: false,
  }).produce(interPub.name, async () => interCert.data);
  let nCommands = 0;
  const nfdP = nfdEp.produce("/localhop/nfd", async (interest) => {
    interP.close();
    await expect(nfdEp.consume(userCert.name)).resolves.toBeInstanceOf(Data);
    await expect(nfdEp.consume(interCert.name)).resolves.toBeInstanceOf(Data);
    ++nCommands;
    return new Data(interest.name, Encoder.encode([0x65,
      [0x66, NNI(200)],
      [0x67]]));
  });

  const userFw = Forwarder.create();
  const bridge = Bridge.create({ fwA: nfdFw, fwB: userFw });
  closers.push(nfdFw, nfdP, interP, userFw, bridge);

  enableNfdPrefixReg(bridge.faceB, {
    signer: userPvt.withKeyLocator(userCert.name),
    preloadCertName: userCert.name,
    preloadFromKeyChain: userKeyChain,
    preloadInterestLifetime: 100,
  });

  const userEp = new Endpoint({ fw: userFw });
  const userPA = userEp.produce("/A", async () => undefined);
  const userPB = userEp.produce("/B", async () => undefined);
  closers.push(userPA, userPB);
  await delay(400);
  expect(nCommands).toBe(2);
});
