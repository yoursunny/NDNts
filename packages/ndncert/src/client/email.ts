import { ChallengeDefinition, ChallengeRequest, ProbeRequest } from "../json-types";

// https://github.com/named-data/ndncert/blob/aae119aeb9b5387f2fd8f80c56ee8cbfe8c15988/src/challenge-module/challenge-email.cpp#L183
const RE_EMAIL = /^[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+.[a-zA-Z0-9\-.]+$/;

type GetCodeCallback = () => Promise<string>;

/** Client side of email challenge. */
export class ClientEmailChallenge {
  /**
   * Constructor.
   * @param email email address.
   * @param getCode callback to obtain PIN code that appears in the email from CA.
   */
  constructor(public readonly email: string, private readonly getCode: GetCodeCallback) {
    if (!RE_EMAIL.test(email)) {
      throw new Error("invalid email address");
    }
  }

  /** Create a PROBE request. */
  public makeProbeRequest(): ProbeRequest {
    return {
      email: this.email,
    };
  }

  /** Select and start email challenge. */
  public startChallenge = async (challenges: ReadonlyArray<ChallengeDefinition>): Promise<ChallengeRequest> => {
    if (!challenges.some((d) => d["challenge-id"] === "email")) {
      throw new Error("server rejects email challenge");
    }
    return {
      "selected-challenge": "email",
      email: this.email,
    };
  }

  /** Continue email challenge by responding with PIN code. */
  public continueChallenge = async (challengeStatus: string): Promise<ChallengeRequest> => {
    if (!["need-code", "wrong-code"].includes(challengeStatus)) {
      throw new Error(`unexpected challenge status ${challengeStatus}`);
    }
    const code = await this.getCode();
    return {
      "selected-challenge": "email",
      code,
    };
  }
}
