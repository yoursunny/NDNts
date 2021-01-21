import { Certificate, CertNaming, KeyChain } from "@ndn/keychain";
import type { Name } from "@ndn/packet";

import type { CertSource } from "./types";

/** Find certificates in KeyChain. */
export class KeyChainCertSource implements CertSource {
  constructor(private readonly keyChain: KeyChain) {}

  public async *findCerts(keyLocator: Name): AsyncIterable<Certificate> {
    if (CertNaming.isCertName(keyLocator)) {
      try {
        const cert = await this.keyChain.getCert(keyLocator);
        yield cert;
      } catch {}
      return;
    }

    for (const certName of await this.keyChain.listCerts(keyLocator)) {
      if (CertNaming.toKeyName(certName).equals(keyLocator)) {
        yield await this.keyChain.getCert(certName);
      }
    }
  }
}
