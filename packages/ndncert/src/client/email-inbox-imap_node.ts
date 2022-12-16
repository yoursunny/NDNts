import type { Config as ImapConfig } from "imap";
import { type ImapEmailsProps, ImapEmails } from "imap-emails";
import type { ParsedMail } from "mailparser";
import { createTestAccount } from "nodemailer";

import type { ClientChallengeContext } from "./challenge";
import type { ClientPinLikeChallenge } from "./pin-like-challenge";

/** Receive email via IMAP for responding to email challenge. */
export class ClientEmailInboxImap {
  constructor(public readonly address: string, imap: ImapConfig, private readonly extract: ClientEmailInboxImap.ExtractOptions = {}) {
    const { user, password } = imap;
    const imapConfig: ImapEmailsProps["imapConfig"] = { ...imap };
    delete (imapConfig as Partial<ImapConfig>).user;
    delete (imapConfig as Partial<ImapConfig>).password;
    this.client = new ImapEmails({
      username: user,
      password,
      imapConfig,
    });
    this.connectPromise = Promise.allSettled([this.client.connect()]);
  }

  private readonly client: ImapEmails;
  private readonly connectPromise: Promise<[PromiseSettledResult<void>]>;
  private since = new Date();

  /** Close IMAP connection. */
  public close(): Promise<void> {
    return this.client.disconnect();
  }

  /** ClientEmailChallenge prompt callback. */
  public readonly promptCallback: ClientPinLikeChallenge.Prompt = async (context: ClientChallengeContext): Promise<string> => {
    for (let i = 0; i < 10; ++i) {
      const found = await this.checkEmails();
      if (found) {
        return found;
      }
    }
    throw new Error("email PIN code not received");
  };

  private async checkEmails(): Promise<string | undefined> {
    const [connected] = await this.connectPromise;
    if (connected.status === "rejected") {
      throw connected.reason as Error;
    }

    const emails = await this.client.getEmails({
      since: this.since,
    });
    this.since = new Date();

    for (const email of emails) {
      const found = this.extractFrom(email);
      if (found !== undefined) {
        return found;
      }
    }

    return undefined;
  }

  private extractFrom({ subject, text, html }: ParsedMail): string | undefined {
    const {
      useSubject = true,
      useText = true,
      useHtml = false,
      regex = /\b(\d{6})\b/,
    } = this.extract;
    const matches = regex.exec([
      useSubject ? subject : "",
      useText ? text : "",
      useHtml ? html : "",
    ].join("\n\n"));
    return matches?.[1];
  }
}
export namespace ClientEmailInboxImap {
  /** Options for extracting PIN from email message. */
  export interface ExtractOptions {
    /**
     * Whether to extract PIN from email subject.
     * @default true
     */
    useSubject?: boolean;

    /**
     * Whether to extract PIN from email text.
     * @default true
     */
    useText?: boolean;

    /**
     * Whether to extract PIN from email HTML.
     * @default false
     */
    useHtml?: boolean;

    /**
     * Regular Expression to extract PIN.
     * Default is any 6-digit token.
     */
    regex?: RegExp;
  }

  /** Create IMAP inbox hosted by Ethereal. */
  export async function createEthereal(extract: ExtractOptions = {}): Promise<ClientEmailInboxImap> {
    const a = await createTestAccount();
    return new ClientEmailInboxImap(a.user, {
      user: a.user,
      password: a.pass,
      host: a.imap.host,
      port: a.imap.port,
      tls: a.imap.secure,
    }, extract);
  }
}
