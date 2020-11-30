import type { ParameterKV } from "../packet/mod";
import { ClientPinLikeChallenge } from "./pin-like-challenge";

/** The "pin" challenge where client receives a pin code through offline means. */
export class ClientPinChallenge extends ClientPinLikeChallenge {
  public readonly challengeId = "pin";

  constructor(protected readonly prompt: ClientPinLikeChallenge.Prompt) {
    super();
  }

  public async start(): Promise<ParameterKV> {
    return {};
  }
}
