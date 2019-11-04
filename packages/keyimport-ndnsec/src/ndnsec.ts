import { KeyChain } from "@ndn/keychain";
import { Name } from "@ndn/name";
import { Decoder } from "@ndn/tlv";
import execa from "execa";

import { importKeyPair } from "./import";
import { SafeBag } from "./safe-bag";

const RE_LIST_KEY = /^\s+\+->\*\s+(\S+)/;

export async function listKeys(): Promise<Name[]> {
  const result = await execa("ndnsec", ["list", "-k"], { stderr: "inherit" });
  const lines = result.stdout.split("\n");

  const keys = [] as Name[];
  for (const line of lines) {
    const m = RE_LIST_KEY.exec(line);
    if (!m) {
      continue;
    }
    keys.push(new Name(m[1]));
  }
  return keys;
}

export async function importKey(name: Name, keyChain: KeyChain): Promise<void> {
  const result = await execa("ndnsec", ["export", "-P", "PASSPHRASE", "-i", name.getPrefix(-2).toString()], { stderr: "inherit" });
  const safeBag = new Decoder(Buffer.from(result.stdout, "base64")).decode(SafeBag);
  const pkcs8 = safeBag.decryptKey("PASSPHRASE");
  await importKeyPair(safeBag.certificate, pkcs8, keyChain);
}
