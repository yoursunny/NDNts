import type { Name } from "@ndn/packet";

import type { Certificate, ValidityPeriod } from "../cert/mod";
import { CertNaming } from "../mod";
import type { CryptoAlgorithm } from "./types";

export function isPublicSecretKey(obj: unknown): obj is CryptoAlgorithm.PublicSecretKey {
  return !!(obj as CryptoAlgorithm.PublicKey).publicKey || !!(obj as CryptoAlgorithm.SecretKey).secretKey;
}

/** Certificate import options for {@link createVerifier} and {@link createDecrypter}. */
export interface ImportCertOptions<A extends CryptoAlgorithm> {
  /**
   * List of recognized algorithms.
   * @defaultValue SigningAlgorithmListSlim or EncryptionAlgorithmListSlim
   *
   * @remarks
   * {@link SigningAlgorithmListSlim} and {@link EncryptionAlgorithmListSlim} only contain a subset
   * of available signing and encryption algorithms. Use {@link SigningAlgorithmListFull} and
   * {@link EncryptionAlgorithmListFull} for all algorithms, at the cost of larger bundle size.
   */
  algoList?: readonly A[];

  /**
   * Whether to check certificate ValidityPeriod.
   * If `true`, throws an error if `.now` is not within ValidityPeriod.
   * @defaultValue true
   */
  checkValidity?: boolean;

  /**
   * Current timestamp for checking ValidityPeriod.
   * @defaultValue `Date.now()`
   */
  now?: ValidityPeriod.TimestampInput;
}

export class ImportCertCached<T, A extends CryptoAlgorithm> {
  constructor(
      private readonly ImportedType: new(keyName: Name, algo: A, key: CryptoAlgorithm.PublicSecretKey) => T,
      private readonly defaultAlgoList: readonly A[],
  ) {}

  private readonly cache = new WeakMap<Certificate, T>();

  public async importCert(cert: Certificate, {
    algoList = this.defaultAlgoList,
    checkValidity = true,
    now = Date.now(),
  }: ImportCertOptions<A>) {
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
