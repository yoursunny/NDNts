import { Certificate, type SigningAlgorithm, SigningAlgorithmListSlim } from "@ndn/keychain";
import { Data, SigInfo, type Verifier } from "@ndn/packet";
import { Decoder } from "@ndn/tlv";

import { type ChallengeRequest, ErrorCode } from "../packet/mod";
import { ServerChallenge, type ServerChallengeContext, type ServerChallengeResponse } from "./challenge";

interface State {
  cert: Certificate;
  nonce: Uint8Array;
}

/** The "possession" challenge where client must present an existing certificate. */
export class ServerPossessionChallenge implements ServerChallenge<State> {
  public readonly challengeId = "possession";
  public readonly timeLimit = 60000;
  public readonly retryLimit = 1;

  /**
   * Constructor.
   * @param verifier - Verifier to accept or reject an existing certificate presented by client.
   *                   This may be a public key of the expected issuer or a trust schema validator.
   * @param assignmentPolicy - Name assignment policy callback. Default permits all assignments.
   * @param algoList - List of recognized algorithms for client certificates.
   * Default is {@link SigningAlgorithmListSlim}.
   */
  constructor(
      private readonly verifier: Verifier,
      private readonly assignmentPolicy?: ServerPossessionChallenge.AssignmentPolicy,
      private readonly algoList = SigningAlgorithmListSlim,
  ) {}

  public process(request: ChallengeRequest, context: ServerChallengeContext<State>): Promise<ServerChallengeResponse> {
    if (!context.challengeState) {
      return this.process0(request, context);
    }
    return this.process1(request, context);
  }

  private async process0(request: ChallengeRequest, context: ServerChallengeContext<State>): Promise<ServerChallengeResponse> {
    const {
      "issued-cert": certWire,
    } = request.parameters;
    if (!certWire) {
      return { fail: ErrorCode.InvalidParameters };
    }

    let cert: Certificate;
    try {
      cert = Certificate.fromData(Decoder.decode(certWire, Data));
    } catch {
      return { fail: ErrorCode.InvalidParameters };
    }
    if (!await ServerChallenge.callAssignmentPolicy(this.assignmentPolicy, context.subjectName, cert)) {
      return { fail: ErrorCode.NameNotAllowed };
    }

    const nonce = SigInfo.generateNonce(16);
    context.challengeState = { cert, nonce };
    return {
      challengeStatus: "need-proof",
      parameters: { nonce },
    };
  }

  private async process1(
      request: ChallengeRequest,
      { challengeState }: ServerChallengeContext<State>,
  ): Promise<ServerChallengeResponse> {
    const { cert, nonce } = challengeState!;
    if (!cert.validity.includes(Date.now())) {
      return { fail: ErrorCode.InvalidParameters };
    }

    const { proof } = request.parameters;
    if (!proof) {
      return { fail: ErrorCode.InvalidParameters };
    }

    try {
      await this.verifier.verify(cert.data);

      const [algo, key] = await cert.importPublicKey(this.algoList);
      const llVerify = (algo as SigningAlgorithm<any, true>).makeLLVerify(key);
      await llVerify(nonce, proof);
    } catch {
      return { fail: ErrorCode.InvalidParameters };
    }

    return { success: true };
  }
}

export namespace ServerPossessionChallenge {
  /**
   * Callback to determine whether the owner of an old certificate is allowed to obtain
   * a certificate of `newSubjectName`. It should throw or return false to disallow assignment.
   */
  export type AssignmentPolicy = ServerChallenge.AssignmentPolicy<[Certificate]>;
}
