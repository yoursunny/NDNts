import { Certificate, EcCurve, ECDSA, generateSigningKey, RSA, RsaModulusLength, type SigningAlgorithm } from "@ndn/keychain";
import { Data } from "@ndn/packet";
import { deleteTmpFiles, writeTmpFile } from "@ndn/segmented-object/test-fixture/tmpfile";
import { Encoder } from "@ndn/tlv";

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

test.each(TABLE)("%p", async ({ algo, genParam }) => {
  const [privateKey, publicKey] = await generateSigningKey("/A", algo, genParam);
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
