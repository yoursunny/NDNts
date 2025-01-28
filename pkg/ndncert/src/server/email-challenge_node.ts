import { AltUri } from "@ndn/naming-convention2";
import type { Name } from "@ndn/packet";
import { fromUtf8, toHex } from "@ndn/util";
import type { SendMailOptions, SentMessageInfo, Transporter } from "nodemailer";
import type { OverrideProperties, Promisable } from "type-fest";

import type { ChallengeRequest } from "../packet/mod";
import type { ServerChallengeContext, ServerChallengeResponse } from "./challenge";
import { ServerPinLikeChallenge } from "./pin-like-challenge";

type State = ServerPinLikeChallenge.State;

const invalidResponse: ServerChallengeResponse = {
  decrementRetry: true,
  challengeStatus: "invalid-email",
};

interface MailSub {
  caPrefix: string;
  requestId: string;
  subjectName: string;
  keyName: string;
  pin: string;
}

function templateSub(input: string, sub: MailSub): string {
  for (const key of ["caPrefix", "requestId", "subjectName", "keyName", "pin"] as Array<keyof MailSub>) {
    input = input.replaceAll(`$${key}$`, sub[key]);
  }
  return input;
}

type EventMap = {
  /** Emitted after sending an email. */
  emailsent: ServerEmailChallenge.SentEvent;

  /** Emitted after failure to send an email. */
  emailerror: ServerEmailChallenge.ErrorEvent;
};

/** The "email" challenge where client receives a pin code via email. */
export class ServerEmailChallenge extends ServerPinLikeChallenge<ServerPinLikeChallenge.State, EventMap> {
  public readonly challengeId = "email";
  public readonly timeLimit = 300000;
  public readonly retryLimit = 3;

  private readonly assignmentPolicy?: ServerEmailChallenge.AssignmentPolicy;
  private readonly mail!: Transporter;
  private readonly template!: ServerEmailChallenge.Template;

  constructor(opts: ServerEmailChallenge.Options) {
    super();
    Object.assign(this, opts);
  }

  protected async start(
      { requestId, parameters: { email } }: ChallengeRequest,
      { profile, subjectName, keyName }: ServerChallengeContext<State>,
  ): Promise<State | ServerChallengeResponse> {
    if (!email) {
      return invalidResponse;
    }
    const to = fromUtf8(email);
    try { await this.assignmentPolicy?.(subjectName, to); } catch { return invalidResponse; }

    const state = new ServerPinLikeChallenge.State();
    const msg = this.prepareMail(to, {
      caPrefix: AltUri.ofName(profile.prefix),
      requestId: toHex(requestId),
      subjectName: AltUri.ofName(subjectName),
      keyName: AltUri.ofName(keyName),
      pin: state.pinString,
    });

    try {
      const info = await this.mail.sendMail(msg);
      this.dispatchTypedEvent("emailsent", new ServerEmailChallenge.SentEvent("emailsent", requestId, info));
    } catch (err: unknown) {
      /* v8 ignore next */
      this.dispatchTypedEvent("emailerror", new ServerEmailChallenge.ErrorEvent("emailerror", requestId, err as Error));
    }
    return state;
  }

  private prepareMail(to: string, sub: MailSub): SendMailOptions {
    return {
      disableUrlAccess: true,
      disableFileAccess: true,
      ...this.template,
      to,
      subject: templateSub(this.template.subject, sub),
      text: templateSub(this.template.text, sub),
      html: this.template.html && templateSub(this.template.html, sub),
    };
  }
}

export namespace ServerEmailChallenge {
  /**
   * Callback to determine whether the owner of `email` is allowed to obtain a certificate
   * of `newSubjectName`. It should throw to disallow assignment.
   */
  export type AssignmentPolicy = (newSubjectName: Name, email: string) => Promisable<void>;

  /**
   * Email template.
   *
   * @remarks
   * In subject, text, and html fields, the following variables will be replaced:
   * - $caPrefix$
   * - $requestId$
   * - $subjectName$
   * - $keyName$
   * - $pin$
   *
   * `disableUrlAccess` and `disableFileAccess` are set to true by default,
   * but they may be overridden in the template object.
   */
  export type Template = OverrideProperties<SendMailOptions, {
    from: string;
    subject: string;
    text: string;
    html?: string;
  }>;

  export interface Options {
    assignmentPolicy?: AssignmentPolicy;
    mail: Transporter;
    template: Template;
  }

  export class SentEvent extends Event {
    constructor(type: string, public readonly requestId: Uint8Array, public readonly sent: SentMessageInfo) {
      super(type);
    }
  }

  export class ErrorEvent extends Event {
    constructor(type: string, public readonly requestId: Uint8Array, public readonly error: Error) {
      super(type);
    }
  }
}
