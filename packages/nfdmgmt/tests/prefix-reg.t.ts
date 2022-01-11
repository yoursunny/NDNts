import "@ndn/packet/test-fixture/expect";

import { Endpoint } from "@ndn/endpoint";
import { type FwFace, Forwarder, FwPacket } from "@ndn/fw";
import { NoopFace } from "@ndn/fw/test-fixture/noop-face";
import { Certificate, generateSigningKey, KeyChain, ValidityPeriod } from "@ndn/keychain";
import { Bridge } from "@ndn/l3face/test-fixture/bridge";
import { Closers } from "@ndn/l3face/test-fixture/closers";
import { Component, Data, Interest, Name, TT } from "@ndn/packet";
import { Decoder, Encoder, NNI } from "@ndn/tlv";
import { EventEmitter } from "node:events";
import { setTimeout as delay } from "node:timers/promises";

import { ControlCommand, enableNfdPrefixReg } from "..";

const closers = new Closers();
afterEach(closers.close);

interface Row {
  faceIsLocal?: boolean;
  commandPrefix?: Name;
  expectedPrefix: Name;
}

const TABLE = [
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
] as Row[];

test.each(TABLE)("reg $#", async ({ faceIsLocal, commandPrefix, expectedPrefix }) => {
  const fw = Forwarder.create();

  const verbs: string[] = [];
  const remoteProcess = (interest: Interest, token: unknown) => {
    expect(interest.name).toHaveLength(expectedPrefix.length as number + 7);
    const verb = interest.name.at(-6).text;
    verbs.push(verb);

    const cpMatcher = [
      ({ type, decoder }: Decoder.Tlv) => {
        expect(type).toBe(TT.Name);
        expect(decoder.decode(Name)).toEqualName("/R");
      },
      ({ type, nni }: Decoder.Tlv) => {
        expect(type).toBe(0x6F); // Origin
        expect(nni).toBe(65);
      },
    ];
    if (verb === "register") {
      cpMatcher.push(
        ({ type, nni }: Decoder.Tlv) => {
          expect(type).toBe(0x6A); // Cost
          expect(nni).toBe(0);
        },
        ({ type, nni }: Decoder.Tlv) => {
          expect(type).toBe(0x6C); // Flags
          expect(nni).toBe(0x02);
        },
      );
    }
    expect(interest.name.at(-5).value).toMatchTlv(({ type, value }) => {
      expect(type).toBe(0x68);
      expect(value).toMatchTlv(...cpMatcher);
    });

    const status = [1, 5].includes(verbs.length) ? 400 : 200;
    const data = new Data(interest.name, Encoder.encode([0x65,
      [0x66, NNI(status)],
      [0x67]]));
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
  appFace.addAnnouncement(new Name("/R"));
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
  await delay(100);
  expect(verbs).toHaveLength(4);
  expect(verbs[3]).toBe("register");

  appFace.removeAnnouncement(new Name("/R"));
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
