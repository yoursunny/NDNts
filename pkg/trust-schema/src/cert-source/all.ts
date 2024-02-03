import type { Certificate, KeyChain } from "@ndn/keychain";
import type { Name } from "@ndn/packet";

import { CertFetcher } from "./fetcher";
import { KeyChainCertSource } from "./keychain";
import { TrustAnchorContainer } from "./trust-anchor-container";
import type { CertSource } from "./types";

/** Find certificates from multiple sources. */
export class CertSources implements CertSource {
  public readonly trustAnchors: TrustAnchorContainer;
  private readonly fetcher?: CertFetcher;
  private readonly keyChainSource?: KeyChainCertSource;
  private readonly list: CertSource[];

  constructor(opts: CertSources.Options) {
    const {
      trustAnchors = [],
      keyChain,
      offline = false,
    } = opts;

    this.trustAnchors = Array.isArray(trustAnchors) ? new TrustAnchorContainer(trustAnchors) : trustAnchors;
    this.list = [this.trustAnchors];

    if (keyChain) {
      this.keyChainSource = new KeyChainCertSource(keyChain);
      this.list.push(this.keyChainSource);
    }

    if (!offline) {
      this.fetcher = new CertFetcher(opts);
      this.list.push(this.fetcher);
    }
  }

  /**
   * Find certificates by certificate name or key name.
   *
   * @remarks
   * Searching from sources in this order:
   * - trust anchors
   * - local KeyChain
   * - network retrieval
   * After finding one or more certificates in a source, subsequent sources are skipped.
   */
  public async *findCerts(keyLocator: Name): AsyncIterable<Certificate> {
    for (const s of this.list) {
      let found = false;
      for await (const cert of s.findCerts(keyLocator)) {
        yield cert;
        found = true;
      }
      if (found) {
        break;
      }
    }
  }

  public isTrustAnchor(cert: Certificate): boolean {
    return this.trustAnchors.has(cert);
  }
}

export namespace CertSources {
  export interface Options extends CertFetcher.Options {
    /** Trust anchor certificates. */
    trustAnchors?: TrustAnchorContainer | Certificate[];

    /** Local KeyChain. */
    keyChain?: KeyChain;

    /** If true, disable CertFetcher. */
    offline?: boolean;
  }
}
