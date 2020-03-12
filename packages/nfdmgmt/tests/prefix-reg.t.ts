import { Endpoint } from "@ndn/endpoint";
import { InterestToken } from "@ndn/fw";
import { Data, Interest, Name } from "@ndn/packet";
import "@ndn/packet/test-fixture/expect";

import { ControlCommand, enableNfdPrefixReg } from "..";

afterEach(() => Endpoint.deleteDefaultForwarder());

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
  const endpoint = new Endpoint();

  const remoteProcess = jest.fn((interest: Interest) => {
    expect(interest.name).toHaveLength(expectedPrefix.length + 7);
    expect(interest.name.at(-5).value).toMatchTlv(({ type, vd }) => {
      expect(type).toBe(0x68);
      expect(vd.decode(Name)).toEqualName("/R");
    });
    const data = new Data(interest.name, Uint8Array.of(
      0x65, 0x07,
      0x66, 0x01, 0xC8, // 200
      0x67, 0x02, 0x4F, 0x4B, // 'OK'
    ));
    return InterestToken.copy(interest, data);
  });
  const face = endpoint.fw.addFace({
    async *transform(iterable) {
      for await (const pkt of iterable) {
        expect(pkt).toBeInstanceOf(Interest);
        yield remoteProcess(pkt as Interest);
      }
    },
  }, { local: faceIsLocal });
  enableNfdPrefixReg(face, { commandPrefix });

  const producer = endpoint.produce("/R", async () => false);
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
