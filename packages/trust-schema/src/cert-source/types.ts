import type { Certificate } from "@ndn/keychain";
import type { Name } from "@ndn/packet";

/** A place to find certificates. */
export interface CertSource {
  /**
   * Find certificates by KeyLocator name.
   * @param keyLocator certificate name or key name.
   * @returns matched certificate(s).
   */
  findCerts(keyLocator: Name): AsyncIterable<Certificate>;
}
