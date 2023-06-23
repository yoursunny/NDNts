import { exitClosers } from "@ndn/cli-common";
import { L3Face } from "@ndn/l3face";
import { SequenceNum } from "@ndn/naming-convention2";
import { TcpTransport } from "@ndn/node-transport";
import { Data, Name } from "@ndn/packet";
import { BulkInsertInitiator, type DataStore } from "@ndn/repo-api";
import { crypto } from "@ndn/util";
import ProgressBar from "progress";
import { batch, consume, pipeline, tap, transform } from "streaming-iterables";
import type { Argv, CommandModule } from "yargs";

import { declareStoreArgs, openStore, type StoreArgs } from "./util";

interface GenDataArgs {
  prefix: Name;
  start: number;
  count: number;
  size: number;
}

function* genData({ prefix, start, count, size }: GenDataArgs) {
  const content = crypto.getRandomValues(new Uint8Array(size));
  for (let seq = start, last = start + count; seq < last; ++seq) {
    yield new Data(prefix.append(SequenceNum, seq), content);
  }
}

interface BaseArgs extends GenDataArgs {
  batch: number;
  parallel: number;
}

function declareBaseArgv(argv: Argv): Argv<BaseArgs> {
  return argv
    .option("prefix", {
      coerce: Name.from,
      default: new Name("/repodemo"),
      desc: "demo data prefix",
      type: "string",
    })
    .option("start", {
      default: 0,
      desc: "start sequence number",
      type: "number",
    })
    .option("count", {
      default: 1048576,
      desc: "count of packets",
      type: "number",
    })
    .option("size", {
      default: 1000,
      desc: "payload size",
      type: "number",
    })
    .option("batch", {
      default: 64,
      desc: "packets per batch",
      type: "number",
    })
    .option("parallel", {
      default: 1,
      desc: "number of parallel transactions",
      type: "number",
    });
}

async function execute(args: BaseArgs, store: DataStore.Insert) {
  const progress = new ProgressBar(":bar :current/:total :rateD/s :elapseds ETA:etas", { total: args.count });
  await pipeline(
    () => genData(args),
    batch(args.batch),
    tap((pkts) => progress.tick(pkts.length)),
    transform(args.parallel, (pkts) => store.insert(...pkts)),
    consume,
  );
  progress.terminate();
}

export const FillStoreCommand: CommandModule<{}, BaseArgs & StoreArgs> = {
  command: "fillstore",
  describe: "fill repo with demo data via store transaction",

  builder(argv) {
    return declareStoreArgs(declareBaseArgv(argv));
  },

  async handler(args) {
    const store = openStore(args);
    await execute(args, store);
  },
};

export const FillBiCommand: CommandModule<{}, BaseArgs & {
  host: string;
  port: number;
}> = {
  command: "fillbi",
  describe: "fill repo with demo data via bulk insertion",

  builder(argv) {
    return declareBaseArgv(argv)
      .option("host", {
        default: "127.0.0.1",
        desc: "destination host",
        type: "string",
      })
      .option("port", {
        default: 7376,
        desc: "destination port",
        type: "number",
      });
  },

  async handler(args) {
    const face = new L3Face(await TcpTransport.connect(args.host, args.port));
    const bi = new BulkInsertInitiator(face);
    exitClosers.push(bi);
    await execute(args, bi);
  },
};
