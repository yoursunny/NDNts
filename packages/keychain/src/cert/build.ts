import { Data, LLSign } from "@ndn/l3pkt";

import { PrivateKey } from "../key";
import { CertificateName } from "../name";

import { ContentTypeKEY } from "./an";
import { Certificate } from "./certificate";
import { ValidityPeriod } from "./validity-period";

interface Options {
  name: CertificateName;
  freshness?: number;
  validity: ValidityPeriod;
  publicKey: Uint8Array;
  signer: PrivateKey;
}

const DEFAULT_FRESHNESS = 3600000;

export async function buildCertificate({
    name,
    freshness = DEFAULT_FRESHNESS,
    validity,
    publicKey,
    signer,
  }: Options): Promise<Certificate> {
  const data = new Data(name.toName(), Data.ContentType(ContentTypeKEY), Data.FreshnessPeriod(freshness));
  ValidityPeriod.set(data.sigInfo, validity);
  data.content = publicKey;
  signer.sign(data);
  await data[LLSign.PROCESS]();
  return new Certificate(data);
}
