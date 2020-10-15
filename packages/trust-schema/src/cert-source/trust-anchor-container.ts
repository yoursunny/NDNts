import { Certificate, CertNaming } from "@ndn/keychain";
import type { Name } from "@ndn/packet";
import { toHex } from "@ndn/tlv";
import MultiMap from "mnemonist/multi-map.js";

import type { CertSource } from "./types";

/** A container of trust anchors. */
export class TrustAnchorContainer implements CertSource {
  private readonly byCertName = new Map<string, Certificate>();
  private readonly byKeyName = new MultiMap<string, Certificate>();

  constructor(certs: Certificate[]) {
    for (const cert of certs) {
      this.add(cert);
    }
  }

  public add(cert: Certificate): void {
    const certNameHex = toHex(cert.name.value);
    if (this.byCertName.has(certNameHex)) {
      return;
    }
    this.byCertName.set(certNameHex, cert);
    this.byKeyName.set(toHex(CertNaming.toKeyName(cert.name).value), cert);
  }

  public remove(cert: Certificate): void {
    this.byCertName.delete(toHex(cert.name.value));
    this.byKeyName.remove(toHex(CertNaming.toKeyName(cert.name).value), cert);
  }

  public has(cert: Certificate): boolean {
    return this.byCertName.has(toHex(cert.name.value));
  }

  /** Find certificates among trust anchors. */
  public async *findCerts(keyLocator: Name): AsyncIterable<Certificate> {
    if (CertNaming.isCertName(keyLocator)) {
      const cert = this.byCertName.get(toHex(keyLocator.value));
      if (cert) {
        yield cert;
      }
      return;
    }

    yield* this.byKeyName.get(toHex(keyLocator.value)) ?? [];
  }
}
