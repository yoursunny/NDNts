import type { ChallengeRequest } from "../packet/mod";
import type { ServerChallenge, ServerChallengeContext, ServerChallengeResponse } from "./challenge";

/** The "nop" challenge where the server would approve every request. */
export class ServerNopChallenge implements ServerChallenge {
  public readonly challengeId = "nop";
  public readonly timeLimit = 1;
  public readonly retryLimit = 1;

  public async process(request: ChallengeRequest, context: ServerChallengeContext): Promise<ServerChallengeResponse> {
    return {
      success: true,
      decrementRetry: false,
      challengeStatus: "success",
    };
  }
}
