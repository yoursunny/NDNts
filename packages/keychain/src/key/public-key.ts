import { LLVerify, SigInfo } from "@ndn/l3pkt";

import { NamedKey, PacketWithSignature } from "./named-key";

type Verifiable = LLVerify.Verifiable & Readonly<PacketWithSignature>;

/** Named public key. */
export abstract class PublicKeyBase extends NamedKey {
  /** Determine whether a packet was signed by this public key. */
  public match(pkt: PacketWithSignature): boolean {
    return pkt.sigInfo?.type === this.sigType && this.doMatch(pkt.sigInfo);
  }

  /** Verify the signature on a packet. */
  public verify(pkt: Verifiable): Promise<void> {
    return pkt[LLVerify.VERIFY]((input, sig) => this.llVerify(input, sig));
  }

  /** Export as SubjectPublicKeyInfo format. */
  public abstract exportAsSpki(): Promise<Uint8Array>;

  protected abstract doMatch(si: SigInfo): boolean;

  protected abstract llVerify(input: Uint8Array, sig: Uint8Array): Promise<void>;
}

export namespace PublicKeyBase {
  /** Throw "incorrect signature" error if ok=false. */
  export function throwOnIncorrectSig(ok: boolean): void {
    if (!ok) {
      throw new Error("incorrect signature");
    }
  }
}

export type PublicKey = PublicKeyBase;

export namespace PublicKey {
  export function isPublicKey(obj: unknown): obj is PublicKey {
    return obj instanceof NamedKey && typeof (obj as PublicKey).verify === "function";
  }
}
