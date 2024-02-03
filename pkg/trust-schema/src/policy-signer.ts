import type { Name, Signer } from "@ndn/packet";

/** Policy based signer. */
export abstract class PolicySigner implements Signer {
  /** Sign a packet. */
  public async sign(pkt: Signer.Signable): Promise<void> {
    const signer = await this.findSigner(pkt.name);
    return signer.sign(pkt);
  }

  /** Locate an existing signer. */
  public abstract findSigner(name: Name): Promise<Signer>;
}
