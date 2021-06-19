import "@ndn/packet/test-fixture/expect";

import { Forwarder, FwFace, FwPacket } from "@ndn/fw";
import { NoopFace } from "@ndn/fw/test-fixture/noop-face";
import { Data, Interest, Name } from "@ndn/packet";
import { Encoder, NNI } from "@ndn/tlv";
import { EventEmitter } from "events";

import { ControlCommand, enableNfdPrefixReg } from "..";

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

test.each(TABLE)("reg %#", async ({ faceIsLocal, commandPrefix, expectedPrefix }) => {
  const fw = Forwarder.create();

  const verbs: string[] = [];
  const remoteProcess = (interest: Interest, token: unknown) => {
    expect(interest.name).toHaveLength(expectedPrefix.length as number + 7);
    verbs.push(interest.name.at(-6).text);
    expect(interest.name.at(-5).value).toMatchTlv(({ type, vd }) => {
      expect(type).toBe(0x68);
      expect(vd.decode(Name)).toEqualName("/R");
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
  await new Promise((r) => setTimeout(r, 70));
  expect(verbs).toHaveLength(2);
  expect(verbs[0]).toBe("register"); // status 400
  expect(verbs[1]).toBe("register");

  await new Promise((r) => setTimeout(r, 330));
  expect(verbs).toHaveLength(3);
  expect(verbs[2]).toBe("register");

  uplinkL3.emit("down");
  await new Promise((r) => setTimeout(r, 100));
  uplinkL3.emit("up");
  await new Promise((r) => setTimeout(r, 100));
  expect(verbs).toHaveLength(4);
  expect(verbs[3]).toBe("register");

  appFace.removeAnnouncement(new Name("/R"));
  await new Promise((r) => setTimeout(r, 70));
  expect(verbs).toHaveLength(6);
  expect(verbs[4]).toBe("unregister"); // status 400
  expect(verbs[5]).toBe("unregister");

  await new Promise((r) => setTimeout(r, 330));
  expect(verbs).toHaveLength(6);

  uplinkL3.emit("down");
  await new Promise((r) => setTimeout(r, 100));
  uplinkL3.emit("up");
  await new Promise((r) => setTimeout(r, 100));
  expect(verbs).toHaveLength(6);

  uplink.close();
});
