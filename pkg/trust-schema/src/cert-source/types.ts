import type { Certificate } from "@ndn/keychain";
import type { Name } from "@ndn/packet";

/** A place to find certificates. */
export interface CertSource {
  /**
   * Find certificates by KeyLocator name.
   * @param keyLocator - Certificate name or key name.
   * @returns Matched certificate(s).
   */
  findCerts(keyLocator: Name): AsyncIterable<Certificate>;
}
