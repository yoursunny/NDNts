import { ConsumerOptions, Endpoint, RetxPolicy } from "@ndn/endpoint";
import { Certificate } from "@ndn/keychain";
import { Interest, KeyLocator, Name, Verifier } from "@ndn/packet";

/** Verify packets according to hierarchical trust model. */
export class HierarchicalVerifier implements Verifier {
  private readonly trustAnchors: Certificate[];
  private readonly endpoint: Endpoint;
  private readonly consumerOpts: ConsumerOptions;

  constructor({
    trustAnchors,
    endpoint = new Endpoint(),
    retx = 2,
  }: HierarchicalVerifier.Options) {
    this.trustAnchors = trustAnchors;
    this.endpoint = endpoint;
    this.consumerOpts = {
      describe: "HierarchicalVerifier",
      retx,
    };
  }

  public async verify(pkt: Verifier.Verifiable, now = new Date()): Promise<void> {
    let lastPkt = pkt;
    let hasTrustAnchor = false;
    const chain: Certificate[] = [];
    while (!hasTrustAnchor) {
      const klName = KeyLocator.mustGetName(lastPkt.sigInfo?.keyLocator);
      const trustAnchor = this.findTrustAnchor(klName);
      let cert: Certificate;
      if (trustAnchor) {
        hasTrustAnchor = true;
        cert = trustAnchor;
      } else {
        cert = await this.fetchCert(klName);
      }
      this.checkHierarchial(cert, lastPkt.name);
      this.checkValidity(cert, now);
      chain.push(cert);
      lastPkt = cert.data;
    }

    await Promise.all(chain.map(async (cert, i) => {
      const key = await cert.loadPublicKey();
      const signed = i === 0 ? pkt : chain[i - 1].data;
      return key.verify(signed);
    }));
  }

  private findTrustAnchor(keyLocator: Name): Certificate|undefined {
    for (const cert of this.trustAnchors) {
      if (keyLocator.isPrefixOf(cert.name)) {
        return cert;
      }
    }
    return undefined;
  }

  private async fetchCert(keyLocator: Name): Promise<Certificate> {
    const interest = new Interest(keyLocator, Interest.CanBePrefix);
    const data = await this.endpoint.consume(interest, this.consumerOpts);
    return Certificate.fromData(data);
  }

  private checkHierarchial({ name, certName }: Certificate, signed: Name): void {
    if (!certName.subjectName.isPrefixOf(signed)) {
      throw new Error(`${name} cannot sign ${signed} in hierarchial model`);
    }
  }

  private checkValidity({ name, validity }: Certificate, now: Date): void {
    if (!validity.includes(now)) {
      throw new Error(`${name} has expired`);
    }
  }
}

export namespace HierarchicalVerifier {
  export interface Options {
    /** List of trust anchors that are trusted unconditionally. */
    trustAnchors: Certificate[];
    /** Endpoint for certificate retrieval. */
    endpoint?: Endpoint;
    /** RetxPolicy for certificate retrieval. */
    retx?: RetxPolicy;
  }
}
