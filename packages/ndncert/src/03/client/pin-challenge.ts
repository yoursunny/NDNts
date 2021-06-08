import type { ParameterKV } from "../packet/mod";
import { ClientPinLikeChallenge } from "./pin-like-challenge";

/** The "pin" challenge where client receives a pin code through offline means. */
export class ClientPinChallenge extends ClientPinLikeChallenge {
  public override readonly challengeId = "pin";

  constructor(protected override readonly prompt: ClientPinLikeChallenge.Prompt) {
    super();
  }

  public override async start(): Promise<ParameterKV> {
    return {};
  }
}
