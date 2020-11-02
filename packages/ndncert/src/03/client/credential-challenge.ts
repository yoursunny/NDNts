import { Certificate } from "@ndn/keychain";
import { LLSign, Name, Signer } from "@ndn/packet";
import { Encoder } from "@ndn/tlv";

import type { ParameterKV } from "../packet/mod";
import type { ClientChallenge, ClientChallengeStartContext } from "./challenge";

/** The "credential" challenge where client must present an existing certificate. */
export class ClientCredentialChallenge implements ClientChallenge {
  public readonly challengeId = "credential";
  private readonly llSign: LLSign;

  /**
   * Constructor.
   * @param cert existing certificate, typically issued by another CA.
   * @param pvt private key corresponding to `cert`.
   *            This is preferably a low-level signer, but can also accept a high-level signer
   *            that conditionally signs the input regardless of the packet name.
   */
  constructor(private readonly cert: Certificate, pvt: LLSign|Signer) {
    if (typeof pvt === "function") {
      this.llSign = pvt;
    } else {
      this.llSign = async (input: Uint8Array) => {
        const pkt = {
          name: new Name(),
          sigValue: new Uint8Array(),
          [LLSign.OP]: async (llSign: LLSign) => {
            pkt.sigValue = await llSign(input);
          },
        };
        await pvt.sign(pkt);
        return pkt.sigValue;
      };
    }
  }

  public async start(context: ClientChallengeStartContext): Promise<ParameterKV> {
    const sig = await this.llSign(context.requestId);
    return {
      "issued-cert": Encoder.encode(this.cert.data),
      "proof-of-private-key": sig,
    };
  }

  public next(): Promise<ParameterKV> {
    return Promise.reject(new Error("unexpected round"));
  }
}
