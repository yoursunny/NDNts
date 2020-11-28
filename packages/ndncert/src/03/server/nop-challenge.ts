import type { ServerChallenge, ServerChallengeResponse } from "./challenge";

/** The "nop" challenge where the server would approve every request. */
export class ServerNopChallenge implements ServerChallenge<never> {
  public readonly challengeId = "nop";
  public readonly timeLimit = 60000;
  public readonly retryLimit = 1;

  public async process(): Promise<ServerChallengeResponse> {
    return { success: true };
  }
}
