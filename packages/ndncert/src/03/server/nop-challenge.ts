import { ChallengeRequest } from "../packet/mod";
import { ServerChallenge, ServerChallengeContext, ServerChallengeResponse } from "./challenge";

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
