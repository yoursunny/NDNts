import { Forwarder } from "@ndn/fw";
import { theDigestKey } from "@ndn/keychain";
import { L3Face } from "@ndn/l3face";
import { Interest } from "@ndn/l3pkt";
import { Name } from "@ndn/name";
import { Segment as Segment02 } from "@ndn/naming-convention-02";
import { Segment as Segment03 } from "@ndn/naming-convention-03";
import { enableNfdPrefixReg } from "@ndn/nfdmgmt";
import { SocketTransport } from "@ndn/node-transport";
import { serve } from "@ndn/segmented-object";
import { Arguments, Argv, CommandModule } from "yargs";

interface Args {
  name: string;
  segment02: boolean;
  router: string;
  nfd: boolean;
}

async function main(args: Args) {
  const tcpFace = Forwarder.getDefault().addFace(new L3Face(
    await SocketTransport.connect({ port: 6363, host: args.router })));
  tcpFace.addRoute(new Name());
  if (args.nfd) {
    enableNfdPrefixReg(tcpFace, { signer: theDigestKey });
    Interest.tolerateSelectors = true;
  }

  const name = new Name(args.name);
  serve(name, process.stdin, {
    segmentNumConvention: args.segment02 ? Segment02 : Segment03,
  });
}

class PutSegmentedCommand implements CommandModule<Args, Args> {
  public command = "put-segmented <name>";
  public describe = "publish segmented object";
  public aliases = ["put"];

  public builder(argv: Argv): Argv<Args> {
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
    })
    .option("nfd", {
      default: false,
      desc: "use NFD prefix registration command and tolerate Selectors",
      type: "boolean",
    });
  }

  public handler(args: Arguments<Args>) {
    main(args);
  }
}

export = new PutSegmentedCommand();
