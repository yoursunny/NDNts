import type { KeyChain } from "@ndn/keychain";
import type { Name, Signer } from "@ndn/packet";

import type { TrustSchemaPolicy } from "./policy";
import type { TrustSchema } from "./schema";

/** Sign packets according to a trust schema. */
export class TrustSchemaSigner implements Signer {
  private readonly keyChain: KeyChain;
  private readonly policy: TrustSchemaPolicy;

  constructor({ keyChain, schema }: TrustSchemaSigner.Options) {
    this.keyChain = keyChain;
    this.policy = schema.policy;
  }

  /** Sign a packet. */
  public async sign(pkt: Signer.Signable): Promise<void> {
    const signer = await this.findSigner(pkt.name);
    return signer.sign(pkt);
  }

  /** Locate an existing signer. */
  public async findSigner(name: Name): Promise<Signer> {
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
