import { toUtf8 } from "@ndn/util";

import type { ParameterKV } from "../packet/mod";
import type { ClientChallenge, ClientChallengeContext } from "./challenge";

/** Base of a challenge where client submits a server-generated pin code. */
export abstract class ClientPinLikeChallenge implements ClientChallenge {
  public abstract readonly challengeId: string;
  protected abstract readonly prompt: ClientPinLikeChallenge.Prompt;

  public abstract start(): Promise<ParameterKV>;

  public async next(context: ClientChallengeContext): Promise<ParameterKV> {
    const pin = await this.prompt(context);
    return { code: toUtf8(pin) };
  }
}

export namespace ClientPinLikeChallenge {
  /** Callback to prompt the user to enter a pin code. */
  export type Prompt = (context: ClientChallengeContext) => Promise<string>;
}
