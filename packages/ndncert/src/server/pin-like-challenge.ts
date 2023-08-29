import { crypto, fromUtf8, timingSafeEqual } from "@ndn/util";
import { TypedEventTarget } from "typescript-event-target";

import type { ChallengeRequest } from "../packet/mod";
import type { ServerChallenge, ServerChallengeContext, ServerChallengeResponse } from "./challenge";

function generatePin(): Uint8Array {
  const b = crypto.getRandomValues(new Uint32Array(6));
  return new Uint8Array(b.map((d) => 0x30 | d % 10));
}

/** Base of a challenge where client submits a server-generated pin code. */
export abstract class ServerPinLikeChallenge<
  State extends ServerPinLikeChallenge.State = ServerPinLikeChallenge.State,
  EventMap extends Record<string, Event> = {},
>
  extends TypedEventTarget<EventMap> implements ServerChallenge<State> {
  public abstract readonly challengeId: string;
  public abstract readonly timeLimit: number;
  public abstract readonly retryLimit: number;

  /**
   * Validate a new request, create State object, and deliver PIN to client if applicable.
   * @param request the CHALLENGE request packet.
   * @param context the challenge context, which contains the certificate request.
   * @returns a State to continue the challenge, or a ServerChallengeResponse to fail the challenge.
   */
  protected abstract start(request: ChallengeRequest, context: ServerChallengeContext<State>): Promise<State | ServerChallengeResponse>;

  public async process(request: ChallengeRequest, context: ServerChallengeContext<State>): Promise<ServerChallengeResponse> {
    if (!context.challengeState) {
      const res = await this.start(request, context);
      if (res instanceof ServerPinLikeChallenge.State) {
        context.challengeState = res;
        return { challengeStatus: "need-code" };
      }
      return res;
    }

    const { code } = request.parameters;
    if (!code || !context.challengeState.verify(code)) {
      return { decrementRetry: true, challengeStatus: "wrong-code" };
    }

    return { success: true };
  }
}

export namespace ServerPinLikeChallenge {
  export class State {
    public readonly pin = generatePin();
    public get pinString() { return fromUtf8(this.pin); }

    public verify(code: Uint8Array): boolean {
      return timingSafeEqual(this.pin, code);
    }
  }
}
