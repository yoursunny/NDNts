import { fetch } from "../../platform/mod";
import { ClientEmailChallenge } from "./email";

interface MailsacError {
  status: number;
  message: string;
}

interface MailsacMessage {
  _id: string;
  subject: string;
}

function makeRandomInbox() {
  return `ndnts-${Math.floor(Math.random() * 0xFFFFFFFF).toString(16).padStart(8, "0")}@mailsac.com`;
}

async function listMessages(email: string): Promise<MailsacMessage[]> {
  const res: MailsacError|MailsacMessage[] =
    await fetch(`https://mailsac.com/api/addresses/${encodeURIComponent(email)}/messages`)
      .then((resp) => resp.json());
  if (!Array.isArray(res)) {
    throw new Error(`${res.status} ${res.message}`);
  }
  return res;
}

async function readMessage(email: string, id: string): Promise<string> {
  return fetch(`https://mailsac.com/api/text/${encodeURIComponent(email)}/${encodeURIComponent(id)}`)
    .then((resp) => resp.text());
}

async function getCode(email: string): Promise<string> {
  let msg: MailsacMessage|undefined;
  while (!msg) {
    await new Promise((r) => setTimeout(r, 4000 + Math.random() * 4000));
    const list = await listMessages(email);
    msg = list.find((msg) => msg.subject.includes("Email Challenge Triggered by NDNCERT"));
  }
  const body = await readMessage(email, msg._id);
  const m = /PIN code:\s+(\d{6})\s+/.exec(body);
  return m ? m[1] : "xxxxxx";
}

/** Construct fully automated email challenge responder using mailsac.com service. */
export async function makeMailsacClientEmailChallenge(): Promise<ClientEmailChallenge> {
  let email!: string;
  let nMessages = -1;
  while (nMessages !== 0) {
    email = makeRandomInbox();
    try { nMessages = (await listMessages(email)).length; } catch (err) {}
  }
  return new ClientEmailChallenge(email, () => getCode(email));
}
