import type { ChallengeRequest } from "../packet/mod";
import { ServerPinLikeChallenge } from "./pin-like-challenge";

type EventMap = {
  /** Emitted when a pin code has been generated. */
  newpin: ServerPinChallenge.PinEvent;
};

/** The "pin" challenge where client receives a pin code through offline means. */
export class ServerPinChallenge extends ServerPinLikeChallenge<ServerPinLikeChallenge.State, EventMap> {
  public readonly challengeId = "pin";
  public readonly timeLimit = 3600000;
  public readonly retryLimit = 3;

  protected async start(request: ChallengeRequest): Promise<ServerPinLikeChallenge.State> {
    const state = new ServerPinLikeChallenge.State();
    this.dispatchTypedEvent("newpin", new ServerPinChallenge.PinEvent("newpin", request.requestId, state.pinString));
    return state;
  }
}

export namespace ServerPinChallenge {
  export class PinEvent extends Event {
    constructor(type: string, public readonly requestId: Uint8Array, public readonly pin: string) {
      super(type);
    }
  }
}
