import type { Promisable } from "type-fest";

import * as ndncert_dns01 from "../dns01-common";
import { ParameterKV } from "../packet/mod";
import type { ClientChallenge, ClientChallengeContext } from "./challenge";

abstract class ClientDnsChallengeBase {
  private recordName = "";
  private recordValue = "";

  constructor(
      protected readonly domain: string,
      protected readonly prompt: ClientDnsChallenge.Prompt,
  ) {}

  public async start(): Promise<ParameterKV> {
    return ParameterKV.from({ domain: this.domain });
  }

  public async next(context: ClientChallengeContext): Promise<ParameterKV> {
    if (context.challengeStatus === "need-record") {
      [this.recordName, this.recordValue] = await this.handleNeedRecord(context);
    }

    await this.prompt(context, this.recordName, this.recordValue);
    return ParameterKV.from({ confirmation: "ready" });
  }

  protected abstract handleNeedRecord(context: ClientChallengeContext): Promisable<[recordName: string, recordValue: string]>;
}

/** The "dns" challenge where client creates a DNS TXT record containing a challenge token. */
export class ClientDnsChallenge extends ClientDnsChallengeBase implements ClientChallenge {
  public readonly challengeId = "dns";

  protected override handleNeedRecord({ parameters }: ClientChallengeContext): [record: string, expected: string] {
    return [ParameterKV.getString(parameters, "record-name"),
      ParameterKV.getString(parameters, "expected-value")];
  }
}

export namespace ClientDnsChallenge {
  /** Callback to prompt the user to insert a DNS TXT record. */
  export type Prompt = (context: ClientChallengeContext, recordName: string, recordValue: string) => Promise<void>;
}

/** The "dns-01" challenge where client creates a DNS TXT record containing a key authorization value. */
export class ClientDns01Challenge extends ClientDnsChallengeBase implements ClientChallenge {
  public readonly challengeId = "dns-01";

  protected override async handleNeedRecord({ certRequest, parameters }: ClientChallengeContext): Promise<[recordName: string, recordValue: string]> {
    const token = ParameterKV.getString(parameters, "token");
    return [
      ndncert_dns01.toRecordName(this.domain),
      await ndncert_dns01.computeRecordValue(token, certRequest.publicKeySpki),
    ];
  }
}
