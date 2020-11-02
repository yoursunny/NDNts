import { Certificate, SigningAlgorithm, SigningAlgorithmList } from "@ndn/keychain";
import { Data, Verifier } from "@ndn/packet";
import { Decoder } from "@ndn/tlv";

import type { ChallengeRequest } from "../packet/mod";
import type { ServerChallenge, ServerChallengeResponse } from "./challenge";

const invalidResponse: ServerChallengeResponse = {
  decrementRetry: true,
  challengeStatus: "invalid-credential",
};

/** The "credential" challenge where client must present an existing certificate. */
export class ServerCredentialChallenge implements ServerChallenge {
  public readonly challengeId = "credential";
  public readonly timeLimit = 60000;
  public readonly retryLimit = 1;

  /**
   * Constructor.
   * @param verifier a verifier to accept or reject a credential certificate.
   *                 This may be a public key of the expected issuer or a trust schema validator.
   */
  constructor(private readonly verifier: Verifier) {
  }

  public async process(request: ChallengeRequest): Promise<ServerChallengeResponse> {
    const {
      "issued-cert": certWire,
      "proof-of-private-key": sig,
    } = request.parameters;
    if (!certWire || !sig) {
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
      await llVerify(request.requestId, sig);
    } catch {
      return invalidResponse;
    }

    return { success: true };
  }
}
