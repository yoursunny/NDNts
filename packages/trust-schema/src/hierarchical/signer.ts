import { CertNaming, type KeyChain } from "@ndn/keychain";
import type { Name, Signer } from "@ndn/packet";

import { PolicySigner } from "../policy-signer";

/** Sign packets according to hierarchical trust model. */
export class HierarchicalSigner extends PolicySigner implements Signer {
  constructor(private readonly keyChain: KeyChain) {
    super();
  }

  /**
   * Locate an existing signer among available certificates in the KeyChain.
   * The certificate's subject name shall be a prefix of the packet name.
   * Longer certificate names are preferred.
   */
  public override async findSigner(name: Name): Promise<Signer> {
    const certs = await this.keyChain.listCerts();
    certs.sort((a, b) => b.length - a.length);
    for (const certName of certs) {
      if (CertNaming.toSubjectName(certName).isPrefixOf(name)) {
        return this.keyChain.getSigner(certName);
      }
    }
    throw new Error(`no signer for ${name}`);
  }
}
