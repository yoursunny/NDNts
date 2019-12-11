import { Certificate } from "@ndn/keychain";
import { Data, Name } from "@ndn/packet";

import { invokeNdnsec } from "./ndnsec";
import { SafeBag } from "./safe-bag";

const RE_LIST_KEY = /^\s+\+->\*\s+(\S+)/;

/** List key names in ndn-cxx KeyChain. */
export function listKeys(): Name[] {
  const result = invokeNdnsec(["list", "-k"]);
  const keys = [] as Name[];
  for (const line of result.lines) {
    const m = RE_LIST_KEY.exec(line);
    if (!m) { continue; }
    keys.push(new Name(m[1]));
  }
  return keys;
}

/** Generate key in ndn-cxx KeyChain. */
export function generateKey(subjectName: Name): Name {
  const result = invokeNdnsec(["key-gen", "-i", subjectName.toString(), "-tr"]);
  const cert = new Certificate(result.decode(Data));
  return cert.certName.toKeyName().toName();
}

/** Export key in ndn-cxx KeyChain as SafeBag. */
export function exportKey(name: Name, passphrase: string): SafeBag {
  const result = invokeNdnsec(["export", "-P", passphrase, "-i", name.getPrefix(-2).toString()]);
  return result.decode(SafeBag);
}
