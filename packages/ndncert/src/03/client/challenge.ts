export interface ClientChallenge {
  readonly challengeId: string;

  start: (context: ClientChallengeStartContext) => Promise<Record<string, Uint8Array>>;
  next: (context: ClientChallengeContext) => Promise<Record<string, Uint8Array>>;
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
