import { type SigningAlgorithm, Certificate, EcCurve, ECDSA, generateSigningKey, RSA, RsaModulusLength } from "@ndn/keychain";
import { Data } from "@ndn/packet";
import { Encoder } from "@ndn/tlv";
import { deleteTmpFiles, writeTmpFile } from "@ndn/util/test-fixture/tmpfile";
import { afterEach, expect, test } from "vitest";

import { execute } from "../../../test-fixture/cxxprogram";

afterEach(deleteTmpFiles);

type Row<G> = {
  algo: SigningAlgorithm<any, true, G>;
  genParam: G;
};

const TABLE = ([] as Array<Row<any>>).concat(
  EcCurve.Choices.map((curve) => ({ algo: ECDSA, genParam: { curve } })),
  RsaModulusLength.Choices.map((modulusLength) => ({ algo: RSA, genParam: { modulusLength } })),
);

test.each(TABLE)("%j", async ({ algo, genParam }) => {
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
