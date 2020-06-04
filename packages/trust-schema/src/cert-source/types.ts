import type { Certificate } from "@ndn/keychain";
import type { Name } from "@ndn/packet";

/** A place to find certificates. */
export interface CertSource {
  /** Find certificates by key name or certificate name. */
  findCerts: (keyLocator: Name) => AsyncIterable<Certificate>;
}
