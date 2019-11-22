import { Decoder } from "@ndn/tlv";
import { createReadStream } from "fs";
import getStream from "get-stream";
import { Arguments, Argv, CommandModule } from "yargs";

import { importKeyPair, SafeBag  } from "../mod";
import { CommonArgs, keyChain } from "./common-args";

interface Args extends CommonArgs {
  file: string;
  passphrase: string;
}

async function main(args: Args) {
  let stream: NodeJS.ReadableStream;
  if (args.file === "-") {
    stream = process.stdin;
  } else {
    stream = createReadStream(args.file);
  }
  const b64 = await getStream(stream);
  const safeBag = new Decoder(Buffer.from(b64, "base64")).decode(SafeBag);
  const pkcs8 = safeBag.decryptKey(args.passphrase);
  await importKeyPair(safeBag.certificate, pkcs8, keyChain);
  await keyChain.insertCert(safeBag.certificate);
}

export class SafeBagCommand implements CommandModule<CommonArgs, Args> {
  public command = "safebag [file]";
  public describe = "import SafeBag";

  public builder(argv: Argv<CommonArgs>): Argv<Args> {
    return argv
    .positional("file", {
      default: "-",
      desc: "filename",
      type: "string",
    })
    .option("passphrase", {
      demandOption: true,
      desc: "SafeBag passphrase",
      type: "string",
    });
  }

  public handler(args: Arguments<Args>) {
    main(args);
  }
}
