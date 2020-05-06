import { ParameterKV } from "../packet/mod";

/** Client side of a challenge. */
export interface ClientChallenge {
  /** Challenge module identifier. */
  readonly challengeId: string;

  /** Create a message to select and start the challenge. */
  start: (context: ClientChallengeStartContext) => Promise<ParameterKV>;

  /** Create a message to continue the challenge. */
  next: (context: ClientChallengeContext) => Promise<ParameterKV>;
}

export interface ClientChallengeStartContext {
  requestId: Uint8Array;
}

export interface ClientChallengeContext {
  requestId: Uint8Array;
  challengeStatus: string;
  remainingTries: number;
  remainingTime: number;
}
