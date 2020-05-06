import { ParameterKV } from "../packet/mod";
import { ClientChallenge } from "./challenge";

/** The "nop" challenge where the server would approve every request. */
export class ClientNopChallenge implements ClientChallenge {
  public readonly challengeId = "nop";

  public async start(): Promise<ParameterKV> {
    return {};
  }

  public next(): Promise<ParameterKV> {
    return Promise.reject(new Error("unexpected round"));
  }
}
