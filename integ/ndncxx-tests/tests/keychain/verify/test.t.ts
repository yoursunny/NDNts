import { EC_CURVES, EcCurve, EcPrivateKey, KeyChain, RSA_MODULUS_LENGTHS, RsaModulusLength,
         RsaPrivateKey, ValidityPeriod } from "@ndn/keychain";
import { Data, LLSign } from "@ndn/l3pkt";
import { Encoder } from "@ndn/tlv";

import { deleteTmpFiles, execute, writeTmpFile } from "../../../test-fixture";

afterEach(deleteTmpFiles);

type Row = {
  cls: typeof EcPrivateKey,
  arg: EcCurve,
} | {
  cls: typeof RsaPrivateKey,
  arg: RsaModulusLength,
};

const TABLE = ([] as Row[]).concat(
  EC_CURVES.map((curve) => ({ cls: EcPrivateKey, arg: curve })),
  RSA_MODULUS_LENGTHS.map((modulusLength) => ({ cls: RsaPrivateKey, arg: modulusLength })),
);

test.each(TABLE)("%p", async ({ cls, arg }) => {
  const keyChain = KeyChain.createTemp();
  const { privateKey, selfSigned } = await keyChain.generateKey(
    cls, "/A/KEY/x", ValidityPeriod.daysFromNow(1), arg);

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
