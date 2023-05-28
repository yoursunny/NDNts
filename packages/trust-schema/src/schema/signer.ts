import type { KeyChain } from "@ndn/keychain";
import type { Name, Signer } from "@ndn/packet";

import { PolicySigner } from "../policy-signer";
import type { TrustSchemaPolicy } from "./policy";
import type { TrustSchema } from "./schema";

/** Sign packets according to a trust schema. */
export class TrustSchemaSigner extends PolicySigner implements Signer {
  private readonly keyChain: KeyChain;
  private readonly policy: TrustSchemaPolicy;

  constructor({ keyChain, schema }: TrustSchemaSigner.Options) {
    super();
    this.keyChain = keyChain;
    this.policy = schema.policy;
  }

  /** Locate an existing signer. */
  public override async findSigner(name: Name): Promise<Signer> {
    for (const certName of await this.keyChain.listCerts()) {
      if (this.policy.canSign(name, certName)) {
        return this.keyChain.getSigner(certName);
      }
    }
    throw new Error(`no signer for ${name}`);
  }
}

export namespace TrustSchemaSigner {
  export interface Options {
    /** KeyChain to find certificates. */
    keyChain: KeyChain;

    /** Trust schema to guide policy. */
    schema: TrustSchema;
  }
}
