import "@ndn/name/test-fixture";
import "@ndn/tlv/test-fixture";

import { Forwarder, SimpleEndpoint } from "@ndn/fw";
import { Data, Interest } from "@ndn/l3pkt";
import { Name } from "@ndn/name";

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

  const remoteProcess = jest.fn((interest: Interest) => {
    expect(interest.name).toHaveLength(expectedPrefix.length + 7);
    expect(interest.name.at(-5).value).toMatchTlv(({ type, vd }) => {
      expect(type).toBe(0x68);
      expect(vd.decode(Name)).toEqualName("/R");
    });
    return new Data(interest.name, Uint8Array.of(
      0x65, 0x07,
      0x66, 0x01, 0xC8, // 200
      0x67, 0x02, 0x4F, 0x4B, // 'OK'
    ));
  });
  const face = fw.addFace({
    async *transform(iterable) {
      for await (const pkt of iterable) {
        expect(pkt).toBeInstanceOf(Interest);
        yield remoteProcess(pkt as Interest);
      }
    },
  });
  if (typeof faceIsLocal !== "undefined") {
    jest.spyOn(face, "isLocal", "get").mockReturnValue(faceIsLocal);
  }
  enableNfdPrefixReg(face, { commandPrefix });

  const se = new SimpleEndpoint(fw);
  const producer = se.produce({
    prefix: new Name("/R"),
    handler() { return Promise.resolve(SimpleEndpoint.TIMEOUT); },
  });
  await new Promise((r) => setTimeout(r, 50));
  expect(remoteProcess).toHaveBeenCalledTimes(1);
  expect(remoteProcess.mock.calls[0][0].name.getPrefix(expectedPrefix.length + 2))
    .toEqualName(`${expectedPrefix}/rib/register`);

  producer.close();
  await new Promise((r) => setTimeout(r, 50));
  expect(remoteProcess).toHaveBeenCalledTimes(2);
  expect(remoteProcess.mock.calls[1][0].name.getPrefix(expectedPrefix.length + 2))
    .toEqualName(`${expectedPrefix}/rib/unregister`);
});
