import type { Name } from "@ndn/packet";

import type { ParameterKV } from "../packet/mod";

/** Client side of a challenge. */
export interface ClientChallenge {
  /** Challenge module identifier. */
  readonly challengeId: string;

  /**
   * Create a message to select and start the challenge.
   * @returns Parameter key-value pairs to send to server in initial CHALLENGE request.
   */
  start: (context: ClientChallengeStartContext) => Promise<ParameterKV>;

  /**
   * Create a message to continue the challenge.
   * @returns Parameter key-value pairs to send to server in continuing CHALLENGE request.
   */
  next: (context: ClientChallengeContext) => Promise<ParameterKV>;
}

/** Contextual information for challenge selection. */
export interface ClientChallengeStartContext {
  /** Request session ID. */
  requestId: Uint8Array;

  /** Certificate name of the self-signed certificate. */
  certRequestName: Name;
}

/** Contextual information for challenge continuation. */
export interface ClientChallengeContext {
  /** Request session ID. */
  requestId: Uint8Array;

  /** Certificate name of the self-signed certificate. */
  certRequestName: Name;

  /** Challenge specific status string. */
  challengeStatus: string;

  /** Number of remaining tries to complete challenge. */
  remainingTries: number;

  /** Remaining time to complete challenge, in milliseconds. */
  remainingTime: number;

  /** Challenge parameter key-value pairs, from CHALLENGE response packet. */
  parameters: ParameterKV;
}
