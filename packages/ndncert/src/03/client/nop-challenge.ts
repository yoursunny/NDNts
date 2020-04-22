import { ClientChallenge } from "./challenge";

export class ClientNopChallenge implements ClientChallenge {
  public readonly challengeId = "nop";

  public async start(): Promise<Record<string, Uint8Array>> {
    return {};
  }

  public next(): Promise<Record<string, Uint8Array>> {
    return Promise.reject(new Error("unexpected round"));
  }
}
