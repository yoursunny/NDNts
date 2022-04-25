import { Certificate, CertNaming, createVerifier, SigningAlgorithmListFull, ValidityPeriod } from "@ndn/keychain";
import { Component, Name } from "@ndn/packet";
import type { Arguments, Argv, CommandModule } from "yargs";

import { inputCertBase64, keyChain, printCertBase64 } from "./util";

interface Args {
  issuer: string;
  "issuer-id": string;
  "valid-days": number;
  "use-key-name-locator": boolean;
}

export class IssueCertCommand implements CommandModule<{}, Args> {
  public command = "issue-cert";
  public describe = "issue certificate";

  public builder(argv: Argv): Argv<Args> {
    return argv
      .option("issuer", {
        demandOption: true,
        desc: "issuer key name or certificate name",
        type: "string",
      })
      .option("issuer-id", {
        default: CertNaming.ISSUER_DEFAULT.toString(),
        desc: "issuer id",
        type: "string",
      })
      .option("valid-days", {
        default: 30,
        desc: "validity period in days since now",
        type: "number",
      })
      .option("use-key-name-locator", {
        default: false,
        desc: "",
        type: "boolean",
      });
  }

  public async handler({
    issuer,
    "issuer-id": issuerIdInput,
    "valid-days": validDays,
    "use-key-name-locator": useKeyNameKeyLocator,
  }: Arguments<Args>) {
    const issuerPrivateKey = await keyChain.getSigner(new Name(issuer), { useKeyNameKeyLocator });

    const certReq = await inputCertBase64();
    const publicKey = await createVerifier(certReq, { algoList: SigningAlgorithmListFull });

    const issuerId = Component.from(issuerIdInput);

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
