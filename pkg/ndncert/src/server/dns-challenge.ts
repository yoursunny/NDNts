import { SigInfo } from "@ndn/packet";
import { fromUtf8, toHex, toUtf8 } from "@ndn/util";
import type { DOHResponse } from "cf-doh";
import isValidHostname from "is-valid-hostname";
import type { Promisable } from "type-fest";

import * as ndncert_dns01 from "../dns01-common";
import { type ChallengeRequest, ErrorCode, type ParameterKV } from "../packet/mod";
import { ServerChallenge, type ServerChallengeContext, type ServerChallengeResponse } from "./challenge";

interface State {
  recordName: string;
  recordValue: string;
}

abstract class ServerDnsChallengeBase {
  private readonly assignmentPolicy?: ServerDnsChallenge.AssignmentPolicy;
  private readonly dohServer: string;

  constructor({
    assignmentPolicy,
    dohServer = "https://cloudflare-dns.com/dns-query",
  }: ServerDnsChallenge.Options = {}) {
    this.assignmentPolicy = assignmentPolicy;
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
    if (!await ServerChallenge.callAssignmentPolicy(this.assignmentPolicy, context.subjectName, domain)) {
      return { fail: ErrorCode.NameNotAllowed };
    }

    const recordName = ndncert_dns01.toRecordName(domain);
    const token = toHex(SigInfo.generateNonce(16));
    const [parameters, recordValue] = await this.makeNeedRecord(context, recordName, token);
    context.challengeState = { recordName, recordValue };
    return {
      challengeStatus: "need-record",
      parameters,
    };
  }

  protected abstract makeNeedRecord(
    context: ServerChallengeContext<State>,
    recordName: string,
    token: string,
  ): Promisable<[parameters: ParameterKV, recordValue: string]>;

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

  private async checkRecord({ recordName, recordValue }: State): Promise<boolean> {
    const url = new URL(this.dohServer);
    url.searchParams.set("name", recordName);
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
        [recordName, `${recordName}.`].includes(answer.name) &&
        Number(answer.type) === 16 &&
        [recordValue, `"${recordValue}"`].includes(answer.data)
      ) {
        return true;
      }
    }
    return false;
  }
}

/** The "dns" challenge where client creates a DNS TXT record containing a challenge token. */
export class ServerDnsChallenge extends ServerDnsChallengeBase implements ServerChallenge<State> {
  public readonly challengeId = "dns";
  public readonly timeLimit = 300000;
  public readonly retryLimit = 3;

  protected override makeNeedRecord(
      context: ServerChallengeContext<State>,
      recordName: string,
      token: string,
  ): [parameters: ParameterKV, expected: string] {
    void context;
    return [
      {
        "record-name": toUtf8(recordName),
        "expected-value": toUtf8(token),
      },
      token,
    ];
  }
}

export namespace ServerDnsChallenge {
  /**
   * Callback to determine whether the owner of a DNS domain is allowed to obtain
   * a certificate of `newSubjectName`. It should throw or return false to disallow assignment.
   */
  export type AssignmentPolicy = ServerChallenge.AssignmentPolicy<[string]>;

  export interface Options {
    /**
     * Name assignment policy.
     * If omitted, any domain can obtain any certificate.
     */
    assignmentPolicy?: AssignmentPolicy;

    /**
     * DNS-over-HTTPS server with application/dns-json capability.
     * Common choices includes:
     * - https://cloudflare-dns.com/dns-query
     * - https://dns.google/resolve
     */
    dohServer?: string;
  }
}

/** The "dns-01" challenge where client creates a DNS TXT record containing a key authorization value. */
export class ServerDns01Challenge extends ServerDnsChallengeBase implements ServerChallenge<State> {
  public readonly challengeId = "dns-01";
  public readonly timeLimit = 3600000;
  public readonly retryLimit = 5;

  protected override async makeNeedRecord(
      context: ServerChallengeContext<State>,
      record: string,
      token: string,
  ): Promise<[parameters: ParameterKV, recordValue: string]> {
    void record;
    return [
      {
        token: toUtf8(token),
      },
      await ndncert_dns01.computeRecordValue(token, context.certRequest.publicKeySpki),
    ];
  }
}
