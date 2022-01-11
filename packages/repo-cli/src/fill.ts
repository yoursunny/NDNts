import { L3Face } from "@ndn/l3face";
import { SequenceNum } from "@ndn/naming-convention2";
import { TcpTransport } from "@ndn/node-transport";
import { Data, Name } from "@ndn/packet";
import { BulkInsertInitiator, DataStore } from "@ndn/repo-api";
import ProgressBar from "progress";
import { batch, consume, pipeline, tap, transform } from "streaming-iterables";
import type { Arguments, Argv, CommandModule } from "yargs";

import { type StoreArgs, declareStoreArgs, openStore, store } from "./util";

interface GenDataArgs {
  prefix: string;
  start: number;
  count: number;
  size: number;
}

function* genData({ prefix: prefixUri, start, count, size }: GenDataArgs) {
  const prefix = new Name(prefixUri);
  const content = new Uint8Array(size);
  for (let i = 0; i < size; ++i) {
    content[i] = Math.random() * 0x100;
  }

  for (let seq = start, last = start + count; seq < last; ++seq) {
    yield new Data(prefix.append(SequenceNum, seq), content);
  }
}

interface BaseArgs extends GenDataArgs {
  batch: number;
  parallel: number;
}

abstract class FillCommandBase {
  protected buildBaseArgv(argv: Argv): Argv<BaseArgs> {
    return argv
      .option("prefix", {
        default: "/repodemo",
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

  protected async execute(args: BaseArgs, store: DataStore.Insert) {
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
}

type FillStoreArgs = BaseArgs & StoreArgs;

export class FillStoreCommand extends FillCommandBase implements CommandModule<{}, FillStoreArgs> {
  public command = "fillstore";
  public describe = "fill repo with demo data via store transaction";

  public builder = (argv: Argv): Argv<FillStoreArgs> => declareStoreArgs(this.buildBaseArgv(argv));

  public handler = async (args: Arguments<FillStoreArgs>) => {
    openStore(args);
    await this.execute(args, store);
  };
}

type FillBiArgs = BaseArgs & {
  host: string;
  port: number;
};

export class FillBiCommand extends FillCommandBase implements CommandModule<{}, FillBiArgs> {
  public command = "fillbi";
  public describe = "fill repo with demo data via bulk insertion";

  public builder = (argv: Argv): Argv<FillBiArgs> => this.buildBaseArgv(argv)
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

  public handler = async (args: Arguments<FillBiArgs>) => {
    const face = new L3Face(await TcpTransport.connect(args.host, args.port));
    const bi = new BulkInsertInitiator(face);
    await this.execute(args, bi);
    await bi.close();
  };
}
