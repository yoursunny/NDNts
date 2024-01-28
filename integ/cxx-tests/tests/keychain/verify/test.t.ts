import { Certificate, EcCurve, ECDSA, generateSigningKey, RSA, RsaModulusLength, type SigningAlgorithm } from "@ndn/keychain";
import { Data } from "@ndn/packet";
import { Encoder } from "@ndn/tlv";
import { deleteTmpFiles, writeTmpFile } from "@ndn/util/test-fixture/tmpfile";
import { afterEach, expect, test } from "vitest";

import { execute } from "../../../test-fixture/cxxprogram";

afterEach(deleteTmpFiles);

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
  void desc;
  const [privateKey, publicKey] = await generateSigningKey("/A", algo, genParam);
  const cert = await Certificate.selfSign({ privateKey, publicKey });

  const packet = new Data("/D", Uint8Array.of(0xC0, 0xC1));
  await privateKey.sign(packet);

  const certFile = writeTmpFile(Encoder.encode(cert.data));
  const packetFile = writeTmpFile(Encoder.encode(packet));
  const { stdout } = await execute(import.meta.url, [certFile, packetFile]);

  const [certOk, packetOk] = stdout.split("\n");
  expect(certOk).toBe("1");
  expect(packetOk).toBe("1");
});
