import { exitClosers } from "@ndn/cli-common";
import { Name } from "@ndn/packet";
import { Metadata, serveMetadata } from "@ndn/rdr";
import { FileChunkSource, serve, serveVersioned, StreamChunkSource } from "@ndn/segmented-object";
import type { CommandModule } from "yargs";

import { checkVersionArg, type CommonArgs, Segment, signer, Version } from "./util";

interface Args extends CommonArgs {
  name: Name;
  rdr: boolean;
  ver: string;
  file?: string;
  "chunk-size": number;
}

export const PutSegmentedCommand: CommandModule<CommonArgs, Args> = {
  command: "put-segmented <name>",
  describe: "publish segmented object",
  aliases: ["put"],

  builder(argv) {
    return argv
      .positional("name", {
        coerce: Name.from,
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
  },

  async handler({ name, rdr, ver, file, chunkSize }) {
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
    exitClosers.push(server);
    if (ver !== "none" && rdr) {
      const metadataServer = serveMetadata(new Metadata(server.prefix), { signer, announcement: false });
      exitClosers.push(metadataServer);
    }
    await exitClosers.wait();
  },
};
