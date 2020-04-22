import { toUtf8 } from "@ndn/tlv";

import { ClientChallenge, ClientChallengeContext } from "./challenge";

export class ClientPinChallenge implements ClientChallenge {
  public readonly challengeId = "pin";

  constructor(private readonly prompt: (context: ClientChallengeContext) => Promise<string>) {
  }

  public async start(): Promise<Record<string, Uint8Array>> {
    return {};
  }

  public async next(context: ClientChallengeContext): Promise<Record<string, Uint8Array>> {
    const pin = await this.prompt(context);
    return { code: toUtf8(pin) };
  }
}
