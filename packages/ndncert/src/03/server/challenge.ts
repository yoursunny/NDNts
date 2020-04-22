import { ChallengeRequest } from "../packet/mod";

export interface ServerChallenge {
  readonly challengeId: string;
  readonly timeLimit: number;
  readonly retryLimit: number;

  process(request: ChallengeRequest, context: ServerChallengeContext): Promise<ServerChallengeResponse>;
}

export interface ServerChallengeContext {
  challengeState?: unknown;
}

export interface ServerChallengeResponse {
  success: boolean;
  decrementRetry: boolean;
  challengeStatus: string;
}
