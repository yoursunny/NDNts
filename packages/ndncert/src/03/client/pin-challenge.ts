import { toUtf8 } from "@ndn/tlv";

import type { ParameterKV } from "../packet/mod";
import type { ClientChallenge, ClientChallengeContext } from "./challenge";

/** The "pin" challenge where client must submit a server-generated pin code to the server. */
export class ClientPinChallenge implements ClientChallenge {
  public readonly challengeId = "pin";

  /**
   * Constructor.
   * @param prompt a callback function to prompt the user for a PIN code.
   */
  constructor(private readonly prompt: (context: ClientChallengeContext) => Promise<string>) {
  }

  public async start(): Promise<ParameterKV> {
    return {};
  }

  public async next(context: ClientChallengeContext): Promise<ParameterKV> {
    const pin = await this.prompt(context);
    return { code: toUtf8(pin) };
  }
}
