import { getSigner, openUplinks } from "@ndn/cli-common";
import { BulkInsertTarget, RepoProducer, respondRdr } from "@ndn/repo";
import { createServer } from "net";
import type { Arguments, Argv, CommandModule } from "yargs";

import { declareStoreArgs, openStore, store, StoreArgs } from "./util";

interface Args extends StoreArgs {
  prefix: string;
  rdr: boolean;
  bi: boolean;
  "bi-host": string;
  "bi-port": number;
  "bi-batch": number;
  "bi-parallel": number;
}

function enableBulkInsertion({
  "bi-host": host,
  "bi-port": port,
  "bi-batch": batch,
  "bi-parallel": parallel,
}: Args) {
  const bi = BulkInsertTarget.create(store, { batch, parallel });
  createServer((sock) => {
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    bi.accept(sock);
  }).listen(port, host);
}

export class ServerCommand implements CommandModule<{}, Args> {
  public command = "server";
  public describe = "run repo server";

  public builder(argv: Argv): Argv<Args> {
    return declareStoreArgs(argv)
      .option("prefix", {
        default: "/localhost/ndntsrepo",
        desc: "command prefix",
        type: "string",
      })
      .option("rdr", {
        default: false,
        desc: "respond to RDR discovery Interests",
        type: "boolean",
      })
      .option("bi", {
        default: true,
        desc: "enable bulk insertion",
        type: "boolean",
      })
      .option("bi-host", {
        default: "127.0.0.1",
        desc: "bulk insertion listen host",
        type: "string",
      })
      .option("bi-port", {
        default: 7376,
        desc: "bulk insertion listen port",
        type: "number",
      })
      .option("bi-batch", {
        default: 64,
        desc: "bulk insertion packets per batch",
        type: "number",
      })
      .option("bi-parallel", {
        default: 1,
        desc: "bulk insertion maximum parallel batches",
        type: "number",
      });
  }

  public async handler(args: Arguments<Args>) {
    await openUplinks();
    openStore(args);
    const opts: RepoProducer.Options = {};
    if (args.rdr) {
      opts.fallback = respondRdr({ signer: await getSigner() });
    }
    RepoProducer.create(store, opts);
    if (args.bi) {
      enableBulkInsertion(args);
    }
  }
}
