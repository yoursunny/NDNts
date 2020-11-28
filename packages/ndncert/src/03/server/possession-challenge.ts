import { Certificate, KeyChainImplWebCrypto, SigningAlgorithm, SigningAlgorithmList } from "@ndn/keychain";
import { Data, Verifier } from "@ndn/packet";
import { Decoder } from "@ndn/tlv";

import type { ChallengeRequest } from "../packet/mod";
import type { ServerChallenge, ServerChallengeContext, ServerChallengeResponse } from "./challenge";

const invalidResponse: ServerChallengeResponse = {
  decrementRetry: true,
  challengeStatus: "invalid-credential",
};

interface State {
  cert: Uint8Array;
  nonce: Uint8Array;
}

/** The "possession" challenge where client must present an existing certificate. */
export class ServerPossessionChallenge implements ServerChallenge<State> {
  public readonly challengeId = "possession";
  public readonly timeLimit = 60000;
  public readonly retryLimit = 1;

  /**
   * Constructor.
   * @param verifier a verifier to accept or reject a credential certificate.
   *                 This may be a public key of the expected issuer or a trust schema validator.
   */
  constructor(private readonly verifier: Verifier) {
  }

  public process(request: ChallengeRequest, context: ServerChallengeContext<State>): Promise<ServerChallengeResponse> {
    if (!context.challengeState) {
      return this.process0(request, context);
    }
    return this.process1(request, context.challengeState);
  }

  private async process0(request: ChallengeRequest, context: ServerChallengeContext<State>): Promise<ServerChallengeResponse> {
    const {
      "issued-cert": cert,
    } = request.parameters;
    if (!cert) {
      return invalidResponse;
    }

    const nonce = KeyChainImplWebCrypto.getRandomValues(new Uint8Array(16));
    context.challengeState = { cert, nonce };
    return {
      challengeStatus: "need-proof",
      parameters: { nonce },
    };
  }

  private async process1(request: ChallengeRequest,
      { cert: certWire, nonce }: State): Promise<ServerChallengeResponse> {
    const { proof } = request.parameters;
    if (!proof) {
      return invalidResponse;
    }

    try {
      const data = new Decoder(certWire).decode(Data);
      const cert = Certificate.fromData(data);
      if (!cert.validity.includes()) {
        return invalidResponse;
      }
      await this.verifier.verify(data);

      const [algo, key] = await cert.importPublicKey(SigningAlgorithmList);
      const llVerify = (algo as SigningAlgorithm<any, true>).makeLLVerify(key);
      await llVerify(nonce, proof);
    } catch {
      return invalidResponse;
    }

    return { success: true };
  }
}
