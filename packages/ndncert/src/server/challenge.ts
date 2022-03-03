import type { Name } from "@ndn/packet";

import type { CaProfile, ChallengeRequest, ParameterKV } from "../packet/mod";

/** Server side of a challenge. */
export interface ServerChallenge<State = any> {
  /** Challenge module identifier. */
  readonly challengeId: string;

  /** Time limit (millis). */
  readonly timeLimit: number;

  /** Retry limit, including the initial attempt. */
  readonly retryLimit: number;

  /** Process selection or continuation of the challenge. */
  process: (request: ChallengeRequest, context: ServerChallengeContext<State>) => Promise<ServerChallengeResponse>;
}

export interface ServerChallengeContext<State = unknown> {
  readonly profile: CaProfile;
  readonly subjectName: Name;
  readonly keyName: Name;

  /** Server-side state of the challenge on a request session. */
  challengeState?: State;
}

export interface ServerChallengeResponse {
  /**
   * If true, challenge has succeeded and server will issue the certificate.
   * @default false
   */
  success?: boolean;

  /**
   * If true, this request counts as one failed retry.
   * @default false
   */
  decrementRetry?: boolean;

  /**
   * ChallengeStatus to convey to the client.
   * @default "error"
   */
  challengeStatus?: string;

  parameters?: ParameterKV;
}
