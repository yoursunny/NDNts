import { LLSign, SigInfo } from "@ndn/packet";

import { NamedKey, PacketWithSignature } from "./named-key";

type Signable = LLSign.Signable & PacketWithSignature;

/** Named private key. */
export abstract class PrivateKeyBase extends NamedKey {
  /** Sign the packet. */
  public sign(pkt: Signable): void {
    const si = pkt.sigInfo ?? new SigInfo();
    si.type = this.sigType;
    si.keyLocator = this.keyLocator;
    pkt.sigInfo = si;
    pkt[LLSign.PENDING] = (input) => this.llSign(input);
  }

  protected abstract llSign(input: Uint8Array): Promise<Uint8Array>;
}

export type PrivateKey = PrivateKeyBase;

export namespace PrivateKey {
  export function isPrivateKey(obj: unknown): obj is PrivateKey {
    return obj instanceof NamedKey && typeof (obj as PrivateKey).sign === "function";
  }
}
