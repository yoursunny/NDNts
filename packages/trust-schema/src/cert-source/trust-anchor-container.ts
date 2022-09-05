import { type Certificate, CertNaming } from "@ndn/keychain";
import { type Name, NameMap, NameMultiMap } from "@ndn/packet";

import type { CertSource } from "./types";

/** A container of trust anchors. */
export class TrustAnchorContainer implements CertSource {
  private readonly byCertName = new NameMap<Certificate>();
  private readonly byKeyName = new NameMultiMap<Certificate>();

  constructor(certs: Certificate[]) {
    for (const cert of certs) {
      this.add(cert);
    }
  }

  public add(cert: Certificate): void {
    if (this.byCertName.has(cert.name)) {
      return;
    }
    this.byCertName.set(cert.name, cert);
    this.byKeyName.add(CertNaming.toKeyName(cert.name), cert);
  }

  public remove(cert: Certificate): void {
    this.byCertName.delete(cert.name);
    this.byKeyName.remove(CertNaming.toKeyName(cert.name), cert);
  }

  public has(cert: Certificate): boolean {
    return this.byCertName.has(cert.name);
  }

  /** Find certificates among trust anchors. */
  public async *findCerts(keyLocator: Name): AsyncIterable<Certificate> {
    if (CertNaming.isCertName(keyLocator)) {
      const cert = this.byCertName.get(keyLocator);
      if (cert) {
        yield cert;
      }
      return;
    }

    yield* this.byKeyName.list(keyLocator);
  }
}
