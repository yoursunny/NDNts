import { Certificate, ValidityPeriod } from "@ndn/keychain";
import { Component, Name } from "@ndn/packet";
import { Arguments, Argv, CommandModule } from "yargs";

import { inputCertBase64, keyChain, printCertBase64 } from "./util";

interface Args {
  issuer: string;
  "issuer-id": string;
  "valid-days": number;
}

export class IssueCertCommand implements CommandModule<{}, Args> {
  public command = "issue-cert";
  public describe = "issue certificate";

  public builder(argv: Argv): Argv<Args> {
    return argv
      .option("issuer", {
        default: "/",
        desc: "issuer key name or prefix",
        type: "string",
      })
      .option("issuer-id", {
        default: "",
        desc: "issuer id",
        type: "string",
      })
      .option("valid-days", {
        default: 30,
        desc: "validity period in days since now",
        type: "number",
      });
  }

  public async handler({ issuer, "issuer-id": issuerIdStr, "valid-days": validDays }: Arguments<Args>) {
    const keyNames = await keyChain.listKeys(new Name(issuer));
    if (keyNames.length === 0) {
      throw new Error(`issuer key ${issuer} not found`);
    }
    const issuerPrivateKey = await keyChain.getKey(keyNames[0], "signer");

    const certReq = await inputCertBase64();
    const publicKey = await certReq.createVerifier();

    const issuerId = Component.from(issuerIdStr);

    const validity = ValidityPeriod.daysFromNow(validDays);

    const cert = await Certificate.issue({
      issuerPrivateKey,
      publicKey,
      issuerId,
      validity,
    });
    printCertBase64(cert);
  }
}
