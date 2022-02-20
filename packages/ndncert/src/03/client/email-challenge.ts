import { toUtf8 } from "@ndn/util";

import type { ParameterKV } from "../packet/mod";
import { ClientPinLikeChallenge } from "./pin-like-challenge";

/** The "email" challenge where client receives a pin code via email. */
export class ClientEmailChallenge extends ClientPinLikeChallenge {
  public override readonly challengeId = "email";

  constructor(
      private readonly email: string,
      protected override readonly prompt: ClientPinLikeChallenge.Prompt,
  ) {
    super();
  }

  public override async start(): Promise<ParameterKV> {
    return { email: toUtf8(this.email) };
  }
}
