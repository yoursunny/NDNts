import { ConsumerOptions, Endpoint, RetxPolicy } from "@ndn/endpoint";
import { Certificate } from "@ndn/keychain";
import { Interest, KeyLocator, Name, Verifier } from "@ndn/packet";

/** Policy based verifier. */
export abstract class PolicyVerifier<Context = unknown> implements Verifier {
  protected readonly trustAnchors: Certificate[];
  protected readonly endpoint: Endpoint;
  protected readonly consumerOpts: ConsumerOptions;

  constructor({
    trustAnchors,
    endpoint = new Endpoint(),
    retx = 2,
  }: PolicyVerifier.Options) {
    this.trustAnchors = trustAnchors;
    this.endpoint = endpoint;
    this.consumerOpts = {
      describe: "PolicyVerifier",
      retx,
    };
  }

  public async verify(pkt: Verifier.Verifiable, now = Date.now()): Promise<void> {
    let lastPkt = pkt;
    let hasTrustAnchor = false;
    const chain: Certificate[] = [];
    while (!hasTrustAnchor) {
      const klName = KeyLocator.mustGetName(lastPkt.sigInfo?.keyLocator);
      const ctx = this.checkKeyLocatorPolicy(lastPkt, klName);
      const trustAnchor = this.findTrustAnchor(klName);
      let cert: Certificate;
      if (trustAnchor) {
        hasTrustAnchor = true;
        cert = trustAnchor;
      } else {
        cert = await this.fetchCert(klName);
      }
      this.checkValidity(cert, now);
      this.checkCertPolicy(lastPkt, cert, ctx);
      chain.push(cert);
      lastPkt = cert.data;
    }

    await Promise.all(chain.map(async (cert, i) => {
      const key = await cert.loadPublicKey();
      const signed = i === 0 ? pkt : chain[i - 1].data;
      return key.verify(signed);
    }));
  }

  /**
   * Check policy on KeyLocator name, before certificate retrieval.
   * @param pkt packet carrying KeyLocator.
   * @param klName KeyLocator name.
   * @throws violating policy.
   * @returns arbitrary value to be passed to checkCertPolicy.
   */
  protected abstract checkKeyLocatorPolicy(pkt: Verifier.Verifiable, klName: Name): Context;

  /**
   * Check policy on certificate name.
   * @param pkt packet carrying KeyLocator that triggered certificate retrieval.
   * @param cert retrieved certificate.
   * @param ctx return value of checkKeyLocatorPolicy.
   */
  protected abstract checkCertPolicy(pkt: Verifier.Verifiable, cert: Certificate, ctx: Context): void;

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

  private checkValidity({ name, validity }: Certificate, now: number): void {
    if (!validity.includes(now)) {
      throw new Error(`${name} has expired`);
    }
  }
}

export namespace PolicyVerifier {
  export interface RetrieveOptions {
    /** Endpoint for certificate retrieval. */
    endpoint?: Endpoint;
    /** RetxPolicy for certificate retrieval. */
    retx?: RetxPolicy;
  }

  export interface Options extends RetrieveOptions {
    /** List of trust anchors that are trusted unconditionally. */
    trustAnchors: Certificate[];
  }
}
