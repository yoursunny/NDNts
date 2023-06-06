import { crypto, toHex } from "@ndn/util";
import type { Config as ImapConfig } from "imap";
import { ImapEmails, type ImapEmailsProps } from "imap-emails";
import type { AddressObject, ParsedMail } from "mailparser";
import { createTestAccount } from "nodemailer";
import pTimeout from "p-timeout";

import type { ClientChallengeContext } from "./challenge";
import type { ClientPinLikeChallenge } from "./pin-like-challenge";

const emailAddressComparer = new Intl.Collator("en", { sensitivity: "base" });

/** Receive email via IMAP for automatically solving email challenge. */
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
    return pTimeout(this.client.disconnect(), {
      milliseconds: 2000,
      message: false,
    });
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

  private extractFrom({ to, subject, text, html }: ParsedMail): string | undefined {
    const {
      checkTo = true,
      useSubject = true,
      useText = true,
      useHtml = false,
      regex = /\b(\d{6})\b/,
    } = this.extract;

    if (checkTo && ![to].flat().some((a) => this.checkToAddress(a))) {
      return undefined;
    }

    const matches = regex.exec([
      useSubject ? subject : "",
      useText ? text : "",
      useHtml ? html : "",
    ].join("\n\n"));
    return matches?.[1];
  }

  private checkToAddress(a: AddressObject | undefined): boolean {
    if (!a) {
      return false;
    }
    return a.value.some((e) => e.address && emailAddressComparer.compare(this.address, e.address) === 0);
  }
}
export namespace ClientEmailInboxImap {
  /** Options for extracting PIN from email message. */
  export interface ExtractOptions {
    /**
     * Whether to check To header contains requesting email address.
     * @default true
     */
    checkTo?: boolean;

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
    const addressParts = a.user.split("@");
    addressParts[0] += `+${toHex(crypto.getRandomValues(new Uint8Array(8)))}`;
    return new ClientEmailInboxImap(addressParts.join("@"), {
      user: a.user,
      password: a.pass,
      host: a.imap.host,
      port: a.imap.port,
      tls: a.imap.secure,
    }, extract);
  }
}
