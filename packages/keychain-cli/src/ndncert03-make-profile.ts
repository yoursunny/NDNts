import fs from "node:fs/promises";

import { CertNaming } from "@ndn/keychain";
import { CaProfile } from "@ndn/ndncert";
import { Name } from "@ndn/packet";
import { Encoder } from "@ndn/tlv";
import type { CommandModule } from "yargs";

import { keyChain } from "./util";

interface Args {
  out: string;
  prefix: string;
  info: string;
  cert: string;
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

  async handler(args) {
    const cert = await keyChain.getCert(new Name(args.cert));
    const signer = await keyChain.getKey(CertNaming.toKeyName(cert.name), "signer");

    const profile = await CaProfile.build({
      prefix: new Name(args.prefix),
      info: args.info,
      probeKeys: [],
      maxValidityPeriod: args["valid-days"] * 86400_000,
      cert,
      signer,
    });
    await fs.writeFile(args.out, Encoder.encode(profile.data));
  },
};
