import { Forwarder } from "@ndn/fw";
import { L3Face } from "@ndn/l3face";
import { Name } from "@ndn/name";
import { Segment as Segment02 } from "@ndn/naming-convention-02";
import { Segment as Segment03 } from "@ndn/naming-convention-03";
import { SocketTransport } from "@ndn/node-transport";
import { fetch } from "@ndn/segmented-object";
import stdout from "stdout-stream";
import { Arguments, Argv, CommandModule } from "yargs";

interface Args {
  name: string;
  segment02: boolean;
  router: string;
}

async function main(args: Args) {
  const tcpFace = Forwarder.getDefault().addFace(new L3Face(
    await SocketTransport.connect({ port: 6363, host: args.router })));
  tcpFace.addRoute(new Name());

  const name = new Name(args.name);
  const fetcher = fetch(name, {
    segmentNumConvention: args.segment02 ? Segment02 : Segment03,
  });
  try {
    await fetcher.writeToStream(stdout);
  } finally {
    tcpFace.close();
  }
}

class GetSegmentedCommand implements CommandModule<Args, Args> {
  public command = "get-segmented <name>";
  public describe = "retrieve segmented object";
  public aliases = ["get"];

  public builder(argv: Argv<Args>): Argv<Args> {
    return argv
    .positional("name", {
      desc: "versioned name prefix",
      type: "string",
    })
    .demandOption("name")
    .option("segment02", {
      default: false,
      desc: "use segment number format from 2014 Naming Convention",
      type: "boolean",
    })
    .option("router", {
      default: "localhost",
      desc: "router hostname",
      type: "string",
    });
  }

  public handler(args: Arguments<Args>) {
    main(args);
  }
}

export = new GetSegmentedCommand();
