import { toUtf8 } from "@ndn/tlv";

import type { ParameterKV } from "../packet/mod";
import { ClientPinLikeChallenge } from "./pin-like-challenge";

/** The "email" challenge where client receives a pin code via email. */
export class ClientEmailChallenge extends ClientPinLikeChallenge {
  public readonly challengeId = "email";

  constructor(
      private readonly email: string,
      protected readonly prompt: ClientPinLikeChallenge.Prompt,
  ) {
    super();
  }

  public async start(): Promise<ParameterKV> {
    return { email: toUtf8(this.email) };
  }
}
