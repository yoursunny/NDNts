import { SigInfo } from "@ndn/packet";
import { fromUtf8, toHex, toUtf8 } from "@ndn/util";
import type { DOHResponse } from "cf-doh";
import isValidHostname from "is-valid-hostname";

import { type ChallengeRequest, ErrorCode } from "../packet/mod";
import type { ServerChallenge, ServerChallengeContext, ServerChallengeResponse } from "./challenge";

interface State {
  record: string;
  token: string;
}

/** The "dns" challenge where client creates a DNS TXT record. */
export class ServerDnsChallenge implements ServerChallenge<State> {
  public readonly challengeId = "dns";
  public readonly timeLimit = 300000;
  public readonly retryLimit = 3;

  private readonly dohServer: string;

  constructor({
    dohServer = "https://cloudflare-dns.com/dns-query",
  }: ServerDnsChallenge.Options = {}) {
    this.dohServer = dohServer;
  }

  public async process(request: ChallengeRequest, context: ServerChallengeContext<State>): Promise<ServerChallengeResponse> {
    if (!context.challengeState) {
      return this.process0(request, context);
    }
    return this.process1(request, context);
  }

  private async process0(request: ChallengeRequest, context: ServerChallengeContext<State>): Promise<ServerChallengeResponse> {
    const { domain: domainWire } = request.parameters;
    if (!domainWire) {
      return { fail: ErrorCode.BadParameterFormat };
    }
    const domain = fromUtf8(domainWire);
    if (!isValidHostname(domain)) {
      return { fail: ErrorCode.InvalidParameters };
    }

    const record = `_ndncert-challenge.${domain}`;
    const token = toHex(SigInfo.generateNonce(16));
    context.challengeState = { record, token };
    return {
      challengeStatus: "need-record",
      parameters: {
        "record-name": toUtf8(record),
        "expected-value": toUtf8(token),
      },
    };
  }

  private async process1(
      request: ChallengeRequest,
      { challengeState }: ServerChallengeContext<State>,
  ): Promise<ServerChallengeResponse> {
    const { confirmation } = request.parameters;
    if (!confirmation) {
      return { fail: ErrorCode.InvalidParameters };
    }

    let ok: boolean;
    try {
      ok = await this.checkRecord(challengeState!);
    } catch {
      ok = false;
    }
    return ok ? { success: true } : {
      decrementRetry: true,
      challengeStatus: "wrong-record",
    };
  }

  private async checkRecord({ record, token }: State): Promise<boolean> {
    const url = new URL(this.dohServer);
    url.searchParams.set("name", record);
    url.searchParams.set("type", "TXT");

    const res = await fetch(url, { headers: { Accept: "application/dns-json" } });
    if (res.status !== 200) {
      return false;
    }
    const j: DOHResponse = await res.json();

    if (Number(j.Status) !== 0) {
      return false;
    }
    for (const answer of j.Answer ?? []) {
      if (
        [record, `${record}.`].includes(answer.name) &&
        Number(answer.type) === 16 &&
        [token, `"${token}"`].includes(answer.data)
      ) {
        return true;
      }
    }
    return false;
  }
}

export namespace ServerDnsChallenge {
  export interface Options {
    /**
     * DNS-over-HTTPS server with application/dns-json capability.
     * Common choices includes:
     * - https://cloudflare-dns.com/dns-query
     * - https://dns.google/resolve
     */
    dohServer?: string;
  }
}
