import { type Certificate, createVerifier, type SigningAlgorithm, SigningAlgorithmListSlim } from "@ndn/keychain";
import { KeyLocator, type Name, type Verifier } from "@ndn/packet";
import DefaultWeakMap from "mnemonist/default-weak-map.js";

import { CertSources } from "./cert-source/mod";

/** Policy based verifier. */
export abstract class PolicyVerifier<Context = unknown> implements Verifier {
  protected readonly certSources: CertSources;
  private readonly algoList: readonly SigningAlgorithm[];

  constructor(opts: PolicyVerifier.Options) {
    this.certSources = new CertSources(opts);
    this.algoList = opts.algoList ?? SigningAlgorithmListSlim;
  }

  /** Verify a packet. */
  public async verify(pkt: Verifier.Verifiable, now = Date.now()): Promise<void> {
    let lastPkt = pkt;
    const chain: Certificate[] = [];
    let hasTrustAnchor = false;
    while (!hasTrustAnchor) {
      const klName = KeyLocator.mustGetName(lastPkt.sigInfo?.keyLocator);
      const ctx = this.checkKeyLocatorPolicy(lastPkt, klName);
      let hasCert = false;
      const certErrors: string[] = [];
      for await (const cert of this.certSources.findCerts(klName)) {
        try {
          cert.checkValidity(now);
          this.checkCertPolicy(lastPkt, cert, ctx);
        } catch (err: unknown) {
          certErrors.push(`${cert.name}:${"\n\t"}${err}`);
          continue;
        }
        chain.push(cert);
        lastPkt = cert.data;
        hasTrustAnchor = this.certSources.isTrustAnchor(cert);
        hasCert = true;
        break;
      }
      if (!hasCert) {
        if (certErrors.length === 0) {
          throw new Error(`cannot retrieve certificate for ${klName}`);
        } else {
          throw new Error(`no acceptable certificate for ${klName}${"\n\n"}${certErrors.join("\n")}`);
        }
      }
    }

    await Promise.all(chain.map(async (cert, i) => {
      if (i === 0) {
        return this.cryptoVerifyUncached(cert, pkt);
      }
      return this.cryptoVerifyCached(cert, chain[i - 1]!.data);
    }));
  }

  /**
   * Check policy on KeyLocator name, before certificate retrieval.
   * @param pkt - Packet carrying KeyLocator.
   * @param klName - KeyLocator name.
   * @returns arbitrary value to be passed to {@link PolicyVerifier.checkCertPolicy}.
   *
   * @throws Error
   * Thrown if policy is violated.
   */
  protected abstract checkKeyLocatorPolicy(pkt: Verifier.Verifiable, klName: Name): Context;

  /**
   * Check policy on certificate name.
   * @param pkt - Packet carrying KeyLocator that triggered certificate retrieval.
   * @param cert - Retrieved certificate.
   * @param ctx - Return value of {@link PolicyVerifier.checkKeyLocatorPolicy}.
   *
   * @throws Error
   * Thrown if policy is violated.
   */
  protected abstract checkCertPolicy(pkt: Verifier.Verifiable, cert: Certificate, ctx: Context): void;

  private async cryptoVerifyUncached(cert: Certificate, packet: Verifier.Verifiable): Promise<void> {
    const key = await createVerifier(cert, { algoList: this.algoList, checkValidity: false });
    return key.verify(packet);
  }

  private readonly cryptoVerifyCache = new DefaultWeakMap<Certificate, DefaultWeakMap<Verifier.Verifiable, Promise<void>>>(
    (cert) => new DefaultWeakMap<Verifier.Verifiable, Promise<void>>(
      (pkt) => this.cryptoVerifyUncached(cert, pkt),
    ));

  private async cryptoVerifyCached(cert: Certificate, packet: Verifier.Verifiable): Promise<void> {
    return this.cryptoVerifyCache.get(cert).get(packet);
  }
}

export namespace PolicyVerifier {
  export interface Options extends CertSources.Options {
    /**
     * List of recognized algorithms in certificates.
     * @defaultValue SigningAlgorithmListSlim
     */
    algoList?: readonly SigningAlgorithm[];
  }
}
