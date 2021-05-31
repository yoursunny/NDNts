import { AltUri } from "@ndn/naming-convention2";
import type { Name } from "@ndn/packet";
import { fromUtf8, toHex } from "@ndn/tlv";
import applyMixins from "applymixins";
import { EventEmitter } from "events";
import type { SendMailOptions, SentMessageInfo, Transporter } from "nodemailer";
// @ts-expect-error
import replaceall from "replaceall";
import type TypedEmitter from "typed-emitter";

import type { ChallengeRequest } from "../packet/mod";
import type { ServerChallenge, ServerChallengeContext, ServerChallengeResponse } from "./challenge";
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
    input = replaceall(`$${key}$`, sub[key], input);
  }
  return input;
}

interface Events {
  /** Emitted after sending an email. */
  emailsent: (requestId: Uint8Array, sent: SentMessageInfo) => void;

  /** Emitted after failure to send an email. */
  emailerror: (requestId: Uint8Array, err: Error) => void;
}

/** The "email" challenge where client receives a pin code via email. */
export class ServerEmailChallenge extends (EventEmitter as new() => TypedEmitter<Events>) implements ServerChallenge {
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
      this.emit("emailsent", requestId, info);
    } catch (err: unknown) {
      /* istanbul ignore next */
      this.emit("emailerror", requestId, err as Error);
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
      html: this.template.html ? templateSub(this.template.html, sub) : undefined,
    };
  }
}
export interface ServerEmailChallenge extends ServerPinLikeChallenge {}
applyMixins(ServerEmailChallenge, [ServerPinLikeChallenge]);

export namespace ServerEmailChallenge {
  /**
   * Callback to determine whether the owner of `email` is allowed to obtain a certificate
   * of `newSubjectName`. It should throw to disallow assignment.
   */
  export type AssignmentPolicy = (newSubjectName: Name, email: string) => Promise<void>;

  /**
   * Email template.
   *
   * In subject, text, and html fields, the following variables will be replaced:
   * - $caPrefix$
   * - $requestId$
   * - $subjectName$
   * - $keyName$
   * - $pin$
   *
   * disableUrlAccess and disableFileAccess are set to true by default,
   * but they may be overridden in the template object.
   */
  export type Template = {
    from: string;
    subject: string;
    text: string;
    html?: string;
  } & Omit<SendMailOptions, "to" | "text" | "html" | "raw">;

  export interface Options {
    assignmentPolicy?: AssignmentPolicy;
    mail: Transporter;
    template: Template;
  }
}
