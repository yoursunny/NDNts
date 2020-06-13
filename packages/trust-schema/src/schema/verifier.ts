import type { Certificate } from "@ndn/keychain";
import { Name, Verifier } from "@ndn/packet";

import { PolicyVerifier } from "../policy-verifier";
import type { TrustSchemaPolicy } from "./policy";
import type { TrustSchema } from "./schema";

interface Context {
  packet: TrustSchemaPolicy.Match[];
}

/** Verify packets according to a trust schema. */
export class TrustSchemaVerifier extends PolicyVerifier<Context> {
  private readonly policy: TrustSchemaPolicy;

  constructor(opts: TrustSchemaVerifier.Options) {
    super({ ...opts, trustAnchors: opts.schema.trustAnchors });
    this.policy = opts.schema.policy;
  }

  protected checkKeyLocatorPolicy({ name }: Verifier.Verifiable, klName: Name): Context {
    const packet = this.policy.match(name);
    if (!this.policy.canSign(packet, klName)) {
      throw new Error(`${klName} cannot sign ${name}`);
    }
    return { packet };
  }

  protected checkCertPolicy({ name }: Verifier.Verifiable, { name: certName }: Certificate, { packet }: Context): void {
    /* istanbul ignore if: cannot happen after checking KeyLocator */
    if (!this.policy.canSign(packet, certName)) {
      throw new Error(`${certName} cannot sign ${name}`);
    }
  }
}

export namespace TrustSchemaVerifier {
  export interface Options extends Omit<PolicyVerifier.Options, "trustAnchors"> {
    /** The trust schema. */
    schema: TrustSchema;
  }
}
