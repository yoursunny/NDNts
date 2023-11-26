import type { Name } from "@ndn/packet";

import type { CaProfile, ChallengeRequest, ParameterKV } from "../packet/mod";

/** Server side of a challenge. */
export interface ServerChallenge<State = any> {
  /** Challenge module identifier. */
  readonly challengeId: string;

  /** Time limit, in milliseconds. */
  readonly timeLimit: number;

  /** Retry limit, including the initial attempt. */
  readonly retryLimit: number;

  /** Process selection or continuation of the challenge. */
  process: (request: ChallengeRequest, context: ServerChallengeContext<State>) => Promise<ServerChallengeResponse>;
}

/** Contextual information for challenge processing. */
export interface ServerChallengeContext<State = unknown> {
  /** CA profile packet. */
  readonly profile: CaProfile;

  /** Subject name of the requested certificate. */
  readonly subjectName: Name;

  /** Key name of the requested certificate. */
  readonly keyName: Name;

  /**
   * Server-side state of the challenge on a request session.
   *
   * For a newly selected challenge, this field is `undefined`.
   * The challenge module can store state information in this field and retrieve it when processing
   * subsequently CHALLENGE request packets.
   */
  challengeState?: State;
}

/** Result of challenge processing. */
export interface ServerChallengeResponse {
  /**
   * If true, challenge has succeeded and server will issue the certificate.
   * @default false
   */
  success?: boolean;

  /**
   * If true, this request counts as one failed try and decrements remaining tries.
   * @default false
   */
  decrementRetry?: boolean;

  /**
   * ChallengeStatus to convey to the client.
   * @default "error"
   */
  challengeStatus?: string;

  /** Parameter key-value pairs to convey to the client. */
  parameters?: ParameterKV;
}
