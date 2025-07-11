import fs from "node:fs/promises";
import path from "node:path";

import { CertNaming } from "@ndn/keychain";
import { AltUri } from "@ndn/naming-convention2";
import { type Name, SigType, ValidityPeriod } from "@ndn/packet";
import { assert } from "@ndn/util";

const validity = new ValidityPeriod(1738125001000, 1835478059000);

/** NDNd PEM test vector. */
export interface PemTestVector {
  sigType: number;
  keyName: Name;
  certName: Name;
  validity: ValidityPeriod;
  keyPem: string;
  certPem: string;
}

export const Ed25519 = makeLoader(
  SigType.Ed25519,
  "/demo/ndnd-key/Ed25519/KEY/%FE%C2ecO%18Z%1C/NA/v=1738987269556",
);

export const RSA_2048 = makeLoader(
  SigType.Sha256WithRsa,
  "/demo/ndnd-key/RSA-2048/KEY/%3F%2B%A9%B2%FFiW%3C/NA/v=1738987269818",
);

export const RSA_4096 = makeLoader(
  SigType.Sha256WithRsa,
  "/demo/ndnd-key/RSA-4096/KEY/%60%5EWb%95%93%D8%E9/NA/v=1738987270477",
);

export const EC_P256 = makeLoader(
  SigType.Sha256WithEcdsa,
  "/demo/ndnd-key/EC-P256/KEY/%9B%7F%28q8%99%89%C5/NA/v=1738987270493",
);

export const EC_P384 = makeLoader(
  SigType.Sha256WithEcdsa,
  "/demo/ndnd-key/EC-P384/KEY/E%E5%CF%F5%1D%80%BE%A4/NA/v=1738987270506",
);

export const EC_P521 = makeLoader(
  SigType.Sha256WithEcdsa,
  "/demo/ndnd-key/EC-P521/KEY/%A9%5D%06%94%2Cg%E2%A4/NA/v=1739023923655",
);

function makeLoader(sigType: number, certNameUri: string): () => Promise<PemTestVector> {
  const certName = AltUri.parseName(certNameUri);
  assert(certName.length === 7);
  const basename = certName.at(2).text;
  return async () => {
    const keyFilename = path.join(import.meta.dirname, "pem", `${basename}.key`);
    const certFilename = path.join(import.meta.dirname, "pem", `${basename}.cert`);
    return {
      sigType,
      keyName: CertNaming.toKeyName(certName),
      certName,
      validity,
      keyPem: await fs.readFile(keyFilename, { encoding: "utf8" }),
      certPem: await fs.readFile(certFilename, { encoding: "utf8" }),
    };
  };
}
