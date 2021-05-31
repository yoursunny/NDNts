import { Certificate } from "@ndn/keychain";
import { LLSign, Name, Signer } from "@ndn/packet";
import { Encoder } from "@ndn/tlv";

import type { ParameterKV } from "../packet/mod";
import type { ClientChallenge, ClientChallengeContext } from "./challenge";

/** The "possession" challenge where client must present an existing certificate. */
export class ClientPossessionChallenge implements ClientChallenge {
  public readonly challengeId = "possession";
  private readonly llSign: LLSign;

  /**
   * Constructor.
   * @param cert existing certificate, typically issued by another CA.
   * @param pvt private key corresponding to `cert`.
   *            This is preferably a low-level signer, but can also accept a high-level signer
   *            that unconditionally signs the input regardless of the packet name.
   */
  constructor(private readonly cert: Certificate, pvt: LLSign | Signer) {
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

  public async start(): Promise<ParameterKV> {
    return {
      "issued-cert": Encoder.encode(this.cert.data),
    };
  }

  public async next({ parameters }: ClientChallengeContext): Promise<ParameterKV> {
    const nonce = parameters.nonce;
    if (!nonce || nonce.byteLength < 16) {
      throw new Error("nonce missing");
    }
    const proof = await this.llSign(nonce);
    return { proof };
  }
}
