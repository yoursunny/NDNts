import { EC_CURVES, EcPrivateKey, KeyChain, ValidityPeriod } from "@ndn/keychain";
import { Data, LLSign } from "@ndn/l3pkt";
import { Encoder } from "@ndn/tlv";

import { deleteTmpFiles, execute, writeTmpFile } from "../../../test-fixture";

afterAll(deleteTmpFiles);

test.each(EC_CURVES)("%p", async (curve) => {
  const keyChain = KeyChain.createTemp();
  const { privateKey, selfSigned } = await keyChain.generateKey(
    EcPrivateKey, "/A/KEY/x", ValidityPeriod.daysFromNow(1), curve);

  const packet = new Data("/D", Uint8Array.of(0xC0, 0xC1));
  privateKey.sign(packet);
  await packet[LLSign.PROCESS]();

  const certFile = writeTmpFile(Encoder.encode(selfSigned.data));
  const packetFile = writeTmpFile(Encoder.encode(packet));
  const input = [certFile, packetFile].join("\n");
  const { stdout } = await execute(__dirname, [], { input });

  const [certOk, packetOk] = stdout.split("\n");
  expect(certOk).toBe("1");
  expect(packetOk).toBe("1");
});
