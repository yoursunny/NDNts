import "@ndn/packet/test-fixture/expect";

import { consume, produce } from "@ndn/endpoint";
import { Forwarder, type FwFace, FwPacket } from "@ndn/fw";
import { NoopFace } from "@ndn/fw/test-fixture/noop-face";
import { Certificate, generateSigningKey, KeyChain } from "@ndn/keychain";
import { Bridge } from "@ndn/l3face";
import { Component, Data, Interest, ParamsDigest, ValidityPeriod } from "@ndn/packet";
import { Decoder, Encoder, NNI } from "@ndn/tlv";
import { Closers, delay } from "@ndn/util";
import { TypedEventTarget } from "typescript-event-target";
import { afterEach, expect, test } from "vitest";

import { ControlParameters, ControlResponse, enableNfdPrefixReg, localhopPrefix, localhostPrefix, PrefixAnn, RouteFlags } from "..";
import { PrefixRegServer } from "../test-fixture/prefix-reg";

const closers = new Closers();
afterEach(closers.close);

test.each([
  ["localhost", true, localhostPrefix],
  ["localhop", false, localhopPrefix],
])("reg %s", { timeout: 10000, retry: 3 }, async (desc, faceIsLocal, expectedPrefix) => {
  void desc;
  const fw = Forwarder.create();
  closers.push(fw);

  const verbs: string[] = [];
  const remoteProcess = (interest: Interest, token: unknown) => {
    expect(interest.name).toHaveLength(expectedPrefix.length + 4);
    expect(interest.name.at(-1).is(ParamsDigest)).toBeTruthy();
    const verb = interest.name.at(-3).text;
    verbs.push(verb);

    const params = Decoder.decode(interest.name.at(-2).value, ControlParameters);
    expect(params.name).toEqualName("/R");
    expect(params.origin).toBe(65);
    if (verb === "register") {
      expect(params.cost).toBe(0);
      expect(params.flags).toBe(RouteFlags.Capture);
      expect(params.expirationPeriod).toBe(60000);
    } else {
      expect(params.cost).toBeUndefined();
      expect(params.flags).toBeUndefined();
      expect(params.expirationPeriod).toBeUndefined();
    }

    const status = [1, 5].includes(verbs.length) ? 400 : 200;
    const data = new Data(interest.name, Encoder.encode(new ControlResponse(status, "", params)));
    return FwPacket.create(data, token);
  };
  const uplinkL3 = new class extends TypedEventTarget<FwFace.RxTxEventMap> implements FwFace.RxTxDuplex {
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
    retry: {
      minTimeout: 1,
      maxTimeout: 1,
    },
    refreshInterval: 1000,
  });

  const appFace = fw.addFace(new NoopFace());
  appFace.addAnnouncement("/R");
  await delay(200);
  expect(verbs).toHaveLength(2);
  expect(verbs[0]).toBe("register"); // status 400
  expect(verbs[1]).toBe("register");

  await delay(1000); // refresh
  expect(verbs).toHaveLength(3);
  expect(verbs[2]).toBe("register");

  uplinkL3.dispatchTypedEvent("down", new Event("down"));
  await delay(200);
  uplinkL3.dispatchTypedEvent("up", new Event("up"));
  await delay(200);
  expect(verbs).toHaveLength(4);
  expect(verbs[3]).toBe("register");

  appFace.removeAnnouncement("/R");
  await delay(200);
  expect(verbs).toHaveLength(6);
  expect(verbs[4]).toBe("unregister"); // status 400
  expect(verbs[5]).toBe("unregister");

  await delay(1200); // refresh should not happen
  expect(verbs).toHaveLength(6);

  uplinkL3.dispatchTypedEvent("down", new Event("down"));
  await delay(200);
  uplinkL3.dispatchTypedEvent("up", new Event("up"));
  await delay(200);
  expect(verbs).toHaveLength(6);
});

test("announce", async () => {
  const bridge = Bridge.create({
    attrAB: { local: true },
    attrBA: { local: true },
    routesAB: [],
    routesBA: ["/"],
  }).rename("R", "E");
  closers.push(bridge);

  const reg = new PrefixRegServer(bridge.faceR);
  closers.push(reg);
  const observer = reg.makeObserver();

  enableNfdPrefixReg(bridge.faceE, {
    PrefixAnn,
    refreshInterval: false,
  });
  const appFace = bridge.fwE.addFace(new NoopFace());

  const paA = await PrefixAnn.build({
    announced: "/A",
    expirationPeriod: 300000,
  });
  appFace.addAnnouncement(paA);
  await delay(100);
  appFace.removeAnnouncement(paA);
  await delay(100);

  expect(observer).toHaveBeenCalledTimes(2);

  const call0 = observer.mock.calls[0]!;
  expect(call0[0].name.length).toBe(5);
  expect(call0[0].appParameters?.length).toBeGreaterThan(0);
  expect(call0[1]).toBe("announce");
  expect(call0[2]).toHaveName("/A");
  expect(call0[2].origin).toBe(129);
  expect(call0[3]?.data).toEncodeAs(Encoder.encode(paA.data));

  const call1 = observer.mock.calls[1]!;
  expect(call1[1]).toBe("unregister");
  expect(call1[2]).toHaveName("/A");
  expect(call1[2].origin).toBe(129);
  expect(call1[3]).toBeUndefined();
});

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

  using bridge = Bridge.create().rename("NFD", "User");
  const interP = produce(interPub.name, async () => interCert.data, {
    fw: bridge.fwNFD,
    announcement: false,
  });
  let nCommands = 0;
  const nfdP = produce("/localhop/nfd", async (interest) => {
    interP.close();
    await expect(consume(userCert.name, { fw: bridge.fwNFD }))
      .resolves.toBeInstanceOf(Data);
    await expect(consume(interCert.name, { fw: bridge.fwNFD }))
      .resolves.toBeInstanceOf(Data);
    ++nCommands;
    return new Data(interest.name, Encoder.encode([0x65,
      [0x66, NNI(200)],
      [0x67]]));
  }, { fw: bridge.fwNFD });
  closers.push(nfdP, interP);

  enableNfdPrefixReg(bridge.faceUser, {
    signer: userPvt.withKeyLocator(userCert.name),
    preloadCertName: userCert.name,
    preloadFromKeyChain: userKeyChain,
    preloadInterestLifetime: 100,
  });

  const userPA = produce("/A", async () => undefined, { fw: bridge.fwUser });
  const userPB = produce("/B", async () => undefined, { fw: bridge.fwUser });
  closers.push(userPA, userPB);
  await delay(600);
  expect(nCommands).toBe(2);
});
