import { Certificate } from "@ndn/keychain";
import { ndnsec } from "@ndn/keyimport-ndnsec";
import { Data } from "@ndn/l3pkt";
import { Name } from "@ndn/name";
import { Decoder } from "@ndn/tlv";
import execa from "execa";

export const importKey = ndnsec.importKey;

/** Generate key in ndn-cxx KeyChain. */
export async function makeKey(subjectName: Name): Promise<Name> {
  const result = await execa("ndnsec", ["key-gen", "-i", subjectName.toString(), "-tr"],
                             { stderr: "inherit" });
  const cert = new Certificate(new Decoder(Buffer.from(result.stdout, "base64")).decode(Data));
  return cert.certName.toKeyName().toName();
}

/** Install certificate to ndn-cxx KeyChain. */
export async function installCert(cert: Certificate): Promise<void> {
  const result = await execa("ndnsec", ["cert-install", "-K", "-f-"], {
    stderr: "inherit",
    input: Buffer.from(Data.getWire(cert.data)).toString("base64"),
  });
  if (result.exitCode !== 0) {
    throw new Error(`ndnsec cert-install error ${result.exitCode}`);
  }
}
