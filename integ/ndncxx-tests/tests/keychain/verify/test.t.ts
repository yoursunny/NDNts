import { Certificate, EC_CURVES, EcCurve, EcPrivateKey, PrivateKey, PublicKey, RSA_MODULUS_LENGTHS, RsaModulusLength, RsaPrivateKey } from "@ndn/keychain";
import { Data } from "@ndn/packet";
import { deleteTmpFiles, writeTmpFile } from "@ndn/segmented-object/test-fixture/tmpfile";
import { Encoder } from "@ndn/tlv";

import { execute } from "../../../test-fixture/cxxprogram";

afterEach(deleteTmpFiles);

type Row = {
  cls: typeof EcPrivateKey;
  arg: EcCurve;
} | {
  cls: typeof RsaPrivateKey;
  arg: RsaModulusLength;
};

const TABLE = ([] as Row[]).concat(
  EC_CURVES.map((curve) => ({ cls: EcPrivateKey, arg: curve })),
  RSA_MODULUS_LENGTHS.map((modulusLength) => ({ cls: RsaPrivateKey, arg: modulusLength })),
);

type KeyGenFunc = (...args: unknown[]) => Promise<[PrivateKey, PublicKey]>;

test.each(TABLE)("%p", async ({ cls, arg }) => {
  const [privateKey, publicKey] = await (cls.generate as KeyGenFunc)("/A", arg);
  const cert = await Certificate.selfSign({ privateKey, publicKey });

  const packet = new Data("/D", Uint8Array.of(0xC0, 0xC1));
  await privateKey.sign(packet);

  const certFile = writeTmpFile(Encoder.encode(cert.data));
  const packetFile = writeTmpFile(Encoder.encode(packet));
  const input = [certFile, packetFile].join("\n");
  const { stdout } = await execute(__dirname, [], { input });

  const [certOk, packetOk] = stdout.split("\n");
  expect(certOk).toBe("1");
  expect(packetOk).toBe("1");
});
