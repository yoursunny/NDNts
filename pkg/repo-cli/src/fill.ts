import { exitClosers } from "@ndn/cli-common";
import { SequenceNum } from "@ndn/naming-convention2";
import { TcpTransport } from "@ndn/node-transport";
import { Data, Name } from "@ndn/packet";
import { BulkInsertInitiator, type DataStore } from "@ndn/repo-api";
import { crypto } from "@ndn/util";
import ProgressBar from "progress";
import { batch, consume, pipeline, tap, transform } from "streaming-iterables";
import type { CommandModule, InferredOptionTypes, Options } from "yargs";

import { openStore, type StoreArgs, storeOptions } from "./util";

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

const baseOptions = {
  prefix: {
    coerce: Name.from,
    default: new Name("/repodemo"),
    desc: "demo data prefix",
    type: "string",
  },
  start: {
    default: 0,
    desc: "start sequence number",
    type: "number",
  },
  count: {
    default: 1048576,
    desc: "count of packets",
    type: "number",
  },
  size: {
    default: 1000,
    desc: "payload size",
    type: "number",
  },
  batch: {
    default: 64,
    desc: "packets per batch",
    type: "number",
  },
  parallel: {
    default: 1,
    desc: "number of parallel transactions",
    type: "number",
  },
  progress: {
    default: true,
    desc: "show progress bar",
    type: "boolean",
  },
} satisfies Record<string, Options>;

type BaseArgs = InferredOptionTypes<typeof baseOptions>;

async function execute(args: BaseArgs, store: DataStore.Insert) {
  const progress = args.progress ?
    new ProgressBar(":bar :current/:total :rateD/s :elapseds ETA:etas", { total: args.count }) :
    undefined;
  try {
    await pipeline(
      () => genData(args),
      batch(args.batch),
      tap((pkts) => progress?.tick(pkts.length)),
      transform(args.parallel, (pkts) => store.insert(...pkts)),
      consume,
    );
  } finally {
    progress?.terminate();
  }
}

export const FillStoreCommand: CommandModule<{}, BaseArgs & StoreArgs> = {
  command: "fillstore",
  describe: "fill repo with demo data via store transaction",

  builder(argv) {
    return argv
      .options(baseOptions)
      .options(storeOptions);
  },

  async handler(args) {
    const store = await openStore(args);
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
    return argv
      .options(baseOptions)
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
    const tr = await TcpTransport.connect(args.host, args.port);
    const bi = new BulkInsertInitiator(tr);
    exitClosers.push(bi);
    await execute(args, bi);
  },
};
