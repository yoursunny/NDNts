import { Name } from "@ndn/packet";

import type { Certificate, ValidityPeriod } from "../cert/mod";
import { CertNaming } from "../mod";
import type { CryptoAlgorithm } from "./types";

export function isPublicSecretKey(obj: unknown): obj is CryptoAlgorithm.PublicSecretKey {
  return !!(obj as CryptoAlgorithm.PublicKey).publicKey || !!(obj as CryptoAlgorithm.SecretKey).secretKey;
}

export class ImportCertCached<T, A extends CryptoAlgorithm> {
  constructor(
      private readonly ImportedType: new(keyName: Name, algo: A, key: CryptoAlgorithm.PublicSecretKey) => T,
      private readonly defaultAlgoList: readonly A[],
  ) {}

  private readonly cache = new WeakMap<Certificate, T>();

  public async importCert(
      cert: Certificate,
      {
        algoList = this.defaultAlgoList,
        checkValidity = true,
        now = Date.now(),
      }: {
        algoList?: readonly A[];
        checkValidity?: boolean;
        now?: ValidityPeriod.TimestampInput;
      },
  ) {
    if (checkValidity) {
      cert.checkValidity(now);
    }

    let p = this.cache.get(cert);
    if (!p) {
      const [algo, key] = await cert.importPublicKey(algoList);
      p = new this.ImportedType(CertNaming.toKeyName(cert.name), algo, key);
      this.cache.set(cert, p);
    }
    return p;
  }
}
