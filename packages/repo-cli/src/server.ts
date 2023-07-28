import { createServer } from "node:net";

import { exitClosers, getSigner, openUplinks } from "@ndn/cli-common";
import { BulkInsertTarget, type DataStore, RepoProducer, respondRdr } from "@ndn/repo";
import type { CommandModule } from "yargs";

import { declareStoreArgs, openStore, type StoreArgs } from "./util";

interface Args extends StoreArgs {
  rdr: boolean;
  bi: boolean;
  "bi-host": string;
  "bi-port": number;
  "bi-batch": number;
  "bi-parallel": number;
}

function enableBulkInsertion(store: DataStore, {
  "bi-host": host,
  "bi-port": port,
  "bi-batch": batch,
  "bi-parallel": parallel,
}: Args) {
  const bi = BulkInsertTarget.create(store, { batch, parallel });
  const server = createServer((sock) => {
    void bi.accept(sock);
  }).listen(port, host);
  exitClosers.push(server);
}

export const ServerCommand: CommandModule<{}, Args> = {
  command: "server",
  describe: "run repo server",

  builder(argv) {
    return declareStoreArgs(argv)
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
  },

  async handler(args) {
    await openUplinks();
    const store = openStore(args);
    const producer = RepoProducer.create(store, {
      fallback: args.rdr ? respondRdr({ signer: await getSigner() }) : undefined,
    });
    exitClosers.push(producer);

    if (args.bi) {
      enableBulkInsertion(store, args);
    }
    await exitClosers.wait();
  },
};
