import applyMixins from "applymixins";
import { EventEmitter } from "node:events";
import type TypedEmitter from "typed-emitter";

import type { ChallengeRequest } from "../packet/mod";
import type { ServerChallenge } from "./challenge";
import { ServerPinLikeChallenge } from "./pin-like-challenge";

interface Events {
  /** Emitted when a pin code has been generated. */
  newpin: (requestId: Uint8Array, pin: string) => void;
}

/** The "pin" challenge where client receives a pin code through offline means. */
export class ServerPinChallenge extends (EventEmitter as new() => TypedEmitter<Events>) implements ServerChallenge {
  public readonly challengeId = "pin";
  public readonly timeLimit = 3600000;
  public readonly retryLimit = 3;

  protected async start(request: ChallengeRequest): Promise<ServerPinLikeChallenge.State> {
    const state = new ServerPinLikeChallenge.State();
    this.emit("newpin", request.requestId, state.pinString);
    return state;
  }
}
export interface ServerPinChallenge extends ServerPinLikeChallenge {}
applyMixins(ServerPinChallenge, [ServerPinLikeChallenge]);
