import { Certificate, CertNaming } from "@ndn/keychain";
import { Name, Verifier } from "@ndn/packet";

import { PolicyVerifier } from "../policy-verifier";

/** Verify packets according to hierarchical trust model. */
export class HierarchicalVerifier extends PolicyVerifier {
  protected checkKeyLocatorPolicy({ name }: Verifier.Verifiable, klName: Name): void {
    if (!CertNaming.toSubjectName(klName).isPrefixOf(name)) {
      throw new Error(`${klName} cannot sign ${name}`);
    }
  }

  protected checkCertPolicy({ name }: Verifier.Verifiable, { name: certName }: Certificate): void {
    /* istanbul ignore if: cannot happen after checking KeyLocator */
    if (!CertNaming.toSubjectName(certName).isPrefixOf(name)) {
      throw new Error(`${certName} cannot sign ${name}`);
    }
  }
}
