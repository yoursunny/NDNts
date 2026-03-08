
import { ParameterKV } from "../packet/mod";
import type { ClientChallenge, ClientChallengeContext } from "./challenge";

/** The "dns" challenge where client creates a DNS TXT record. */
export class ClientDnsChallenge implements ClientChallenge {
  public readonly challengeId = "dns";

  constructor(
      private readonly domain: string,
      private readonly prompt: ClientDnsChallenge.Prompt,
  ) {}

  public async start(): Promise<ParameterKV> {
    return ParameterKV.from({ domain: this.domain });
  }

  public async next(context: ClientChallengeContext): Promise<ParameterKV> {
    if (context.challengeStatus !== "need-record") {
      throw new Error(`bad challenge-status ${context.challengeStatus}`);
    }

    await this.prompt(
      context,
      ParameterKV.getString(context.parameters, "record-name"),
      ParameterKV.getString(context.parameters, "expected-value"),
    );
    return ParameterKV.from({ confirmation: "ready" });
  }
}

export namespace ClientDnsChallenge {
  /** Callback to prompt the user to insert a DNS TXT record. */
  export type Prompt = (context: ClientChallengeContext, recordName: string, expectedValue: string) => Promise<void>;
}
