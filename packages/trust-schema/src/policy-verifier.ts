import { type Certificate, type SigningAlgorithm, createVerifier, SigningAlgorithmListSlim } from "@ndn/keychain";
import { type Verifier, KeyLocator, Name } from "@ndn/packet";
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
          this.checkValidity(cert, now);
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

  private checkValidity({ name, validity }: Certificate, now: number): void {
    if (!validity.includes(now)) {
      throw new Error(`${name} has expired`);
    }
  }

  private async cryptoVerifyUncached(cert: Certificate, packet: Verifier.Verifiable): Promise<void> {
    const key = await createVerifier(cert, this.algoList);
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
    /** List of recognized algorithms in certificates. */
    algoList?: readonly SigningAlgorithm[];
  }
}
