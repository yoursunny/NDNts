import fs from "node:fs/promises";

import { CertNaming } from "@ndn/keychain";
import { CaProfile } from "@ndn/ndncert";
import { Name } from "@ndn/packet";
import { Encoder } from "@ndn/tlv";
import type { CommandModule } from "yargs";

import { keyChain } from "./util";

interface Args {
  out: string;
  prefix: Name;
  info: string;
  cert: Name;
  "valid-days": number;
}

export const Ndncert03MakeProfileCommand: CommandModule<{}, Args> = {
  command: "ndncert03-make-profile",
  describe: "generate CA profile of NDNCERT 0.3",

  builder(argv) {
    return argv
      .option("out", {
        demandOption: true,
        desc: "output filename",
        type: "string",
      })
      .option("prefix", {
        coerce: Name.from,
        demandOption: true,
        desc: "CA name prefix",
        type: "string",
      })
      .option("info", {
        default: "NDNts NDNCERT CA",
        desc: "CA introduction",
        type: "string",
      })
      .option("cert", {
        coerce: Name.from,
        demandOption: true,
        desc: "CA certificate name",
        type: "string",
      })
      .option("valid-days", {
        default: 30,
        desc: "maximum validity period",
        type: "number",
      })
      .check(({ cert }) => CertNaming.isCertName(new Name(cert)));
  },

  async handler({ out: outFile, prefix, info, cert: certName, validDays }) {
    const cert = await keyChain.getCert(certName);
    const signer = await keyChain.getKey(CertNaming.toKeyName(cert.name), "signer");

    const profile = await CaProfile.build({
      prefix,
      info,
      probeKeys: [],
      maxValidityPeriod: validDays * 86400_000,
      cert,
      signer,
    });
    await fs.writeFile(outFile, Encoder.encode(profile.data));
  },
};
