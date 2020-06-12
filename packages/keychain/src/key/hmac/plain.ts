import { LLSign, LLVerify, Signer, SigType, Verifier } from "@ndn/packet";

import { crypto } from "../crypto_node";

export class PlainHmacKey implements Signer, Verifier {
  constructor(private readonly key: CryptoKey) {
  }

  public sign(pkt: Signer.Signable): Promise<void> {
    Signer.putSigInfo(pkt, SigType.HmacWithSha256); // not changing KeyLocator
    return pkt[LLSign.OP](async (input) => {
      const h = await crypto.subtle.sign("HMAC", this.key, input);
      return new Uint8Array(h);
    });
  }

  public async verify(pkt: Verifier.Verifiable): Promise<void> {
    Verifier.checkSigType(pkt, SigType.HmacWithSha256);
    return pkt[LLVerify.OP](async (input, sig) => {
      const ok = await crypto.subtle.verify("HMAC", this.key, sig, input);
      Verifier.throwOnBadSig(ok);
    });
  }
}

export namespace PlainHmacKey {
  export const GEN_PARAMS: HmacKeyGenParams&HmacImportParams = {
    name: "HMAC",
    hash: "SHA-256",
  };
}
