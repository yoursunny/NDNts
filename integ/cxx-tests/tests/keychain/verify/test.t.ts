import { Certificate, EcCurve, ECDSA, generateSigningKey, RSA, RsaModulusLength, type SigningAlgorithm } from "@ndn/keychain";
import { Data } from "@ndn/packet";
import { Encoder } from "@ndn/tlv";
import { makeTmpDir } from "@ndn/util/test-fixture/tmp";
import { expect, test } from "vitest";

import * as cxx from "../../../test-fixture/cxxprogram";

type Row<G> = [
  desc: string,
  algo: SigningAlgorithm<any, true, G>,
  genParam: G,
];

const TABLE = ([] as Array<Row<any>>).concat(
  EcCurve.Choices.map((curve) => [`ECDSA ${curve}`, ECDSA, { curve }]),
  RsaModulusLength.Choices.map((modulusLength) => [`RSA ${modulusLength}`, RSA, { modulusLength }]),
);

test.each(TABLE)("%s", async (desc, algo, genParam) => {
  const exe = await cxx.compile(import.meta.dirname);

  void desc;
  const [privateKey, publicKey] = await generateSigningKey("/A", algo, genParam);
  const cert = await Certificate.selfSign({ privateKey, publicKey });

  const packet = new Data("/D", Uint8Array.of(0xC0, 0xC1));
  await privateKey.sign(packet);

  using tmpDir = makeTmpDir();
  const certFile = tmpDir.createFile(Encoder.encode(cert.data));
  const packetFile = tmpDir.createFile(Encoder.encode(packet));
  const { stdout } = await exe.run([certFile, packetFile], {});

  const [certOk, packetOk] = stdout;
  expect(certOk).toBe("1");
  expect(packetOk).toBe("1");
});
