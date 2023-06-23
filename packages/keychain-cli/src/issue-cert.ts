import { Certificate, CertNaming, createVerifier, SigningAlgorithmListFull, ValidityPeriod } from "@ndn/keychain";
import { Component, Name } from "@ndn/packet";
import type { CommandModule } from "yargs";

import { inputCertBase64, keyChain, printCertBase64 } from "./util";

interface Args {
  issuer: Name;
  "issuer-id": Component;
  "valid-days": number;
  "use-key-name-locator": boolean;
}

export const IssueCertCommand: CommandModule<{}, Args> = {
  command: "issue-cert",
  describe: "issue certificate",

  builder(argv) {
    return argv
      .option("issuer", {
        coerce: Name.from,
        demandOption: true,
        desc: "issuer key name or certificate name",
        type: "string",
      })
      .option("issuer-id", {
        coerce: Component.from,
        default: CertNaming.ISSUER_DEFAULT,
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
  },

  async handler({ issuer, issuerId, validDays, useKeyNameLocator }) {
    const issuerPrivateKey = await keyChain.getSigner(issuer, { useKeyNameKeyLocator: useKeyNameLocator });

    const certReq = await inputCertBase64();
    const publicKey = await createVerifier(certReq, { algoList: SigningAlgorithmListFull });

    const cert = await Certificate.issue({
      issuerPrivateKey,
      publicKey,
      issuerId,
      validity: ValidityPeriod.daysFromNow(validDays),
    });
    printCertBase64(cert);
  },
};
