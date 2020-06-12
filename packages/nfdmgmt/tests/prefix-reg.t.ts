import "@ndn/packet/test-fixture/expect";

import { Forwarder, InterestToken } from "@ndn/fw";
import { NoopFace } from "@ndn/fw/test-fixture/noop-face";
import { Data, Interest, Name } from "@ndn/packet";
import { Encoder, NNI } from "@ndn/tlv";

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
  const remoteProcess = (interest: Interest) => {
    expect(interest.name).toHaveLength(expectedPrefix.length as number + 7);
    verbs.push(interest.name.at(-6).text);
    expect(interest.name.at(-5).value).toMatchTlv(({ type, vd }) => {
      expect(type).toBe(0x68);
      expect(vd.decode(Name)).toEqualName("/R");
    });
    const status = verbs.length === 1 ? 400 : 200;
    const data = new Data(interest.name, Encoder.encode([0x65,
      [0x66, NNI(status)],
      [0x67]]));
    return InterestToken.copy(interest, data);
  };
  const uplink = fw.addFace({
    async *transform(iterable) {
      for await (const pkt of iterable) {
        expect(pkt).toBeInstanceOf(Interest);
        yield remoteProcess(pkt as Interest);
      }
    },
  }, { local: faceIsLocal });
  enableNfdPrefixReg(uplink, {
    commandPrefix,
    retry: {
      minTimeout: 1,
      maxTimeout: 1,
    },
    refreshInterval: 100,
  });

  const appFace = fw.addFace(new NoopFace());
  appFace.addAnnouncement(new Name("/R"));
  await new Promise((r) => setTimeout(r, 40));
  expect(verbs).toHaveLength(2);
  expect(verbs[0]).toBe("register");
  expect(verbs[1]).toBe("register");

  await new Promise((r) => setTimeout(r, 110));
  expect(verbs).toHaveLength(3);
  expect(verbs[2]).toBe("register");

  appFace.removeAnnouncement(new Name("/R"));
  await new Promise((r) => setTimeout(r, 40));
  expect(verbs).toHaveLength(4);
  expect(verbs[3]).toBe("unregister");

  await new Promise((r) => setTimeout(r, 110));
  expect(verbs).toHaveLength(4);

  uplink.close();
});
