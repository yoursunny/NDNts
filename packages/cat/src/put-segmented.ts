import { Metadata, serveMetadata } from "@ndn/rdr";
import { FileChunkSource, serve, serveVersioned, StreamChunkSource } from "@ndn/segmented-object";
import type { Arguments, Argv, CommandModule } from "yargs";

import { checkVersionArg, type CommonArgs, Segment, signer, Version } from "./util";

interface Args extends CommonArgs {
  name: string;
  rdr: boolean;
  ver: string;
  file?: string;
  "chunk-size": number;
}

function main({ name, rdr, ver, file, "chunk-size": chunkSize }: Args) {
  const serveFunc = ver === "none" ? serve : serveVersioned;
  const source = file ?
    new FileChunkSource(file, { chunkSize }) :
    new StreamChunkSource(process.stdin, { chunkSize });
  const server = serveFunc(name, source, {
    segmentNumConvention: Segment,
    signer,
    version: ver === "now" ? undefined : Number.parseInt(ver, 10),
    versionConvention: Version,
  });
  if (ver !== "none" && rdr) {
    serveMetadata(new Metadata(server.prefix), { signer, announcement: false });
  }
}

export class PutSegmentedCommand implements CommandModule<CommonArgs, Args> {
  public command = "put-segmented <name>";
  public describe = "publish segmented object";
  public aliases = ["put"];

  public builder(argv: Argv<CommonArgs>): Argv<Args> {
    return argv
      .positional("name", {
        demandOption: true,
        desc: "name prefix",
        type: "string",
      })
      .option("rdr", {
        default: true,
        desc: "publish RDR metadata packet",
        type: "boolean",
      })
      .option("ver", {
        default: "now",
        desc: "version number; 'none' to omit version component, 'now' to use current timestamp",
        type: "string",
      })
      .option("file", {
        desc: "read from file instead of stdin",
        type: "string",
      })
      .option("chunk-size", {
        default: 4096,
        desc: "segment payload size",
        type: "number",
      })
      .check(checkVersionArg(["none", "now"]));
  }

  public async handler(args: Arguments<Args>) {
    main(args);
    await new Promise(() => undefined);
  }
}
