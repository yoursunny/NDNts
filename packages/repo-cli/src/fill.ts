import { L3Face } from "@ndn/l3face";
import { SequenceNum } from "@ndn/naming-convention2";
import { TcpTransport } from "@ndn/node-transport";
import { Data, Name } from "@ndn/packet";
import ProgressBar from "progress";
import { batch, consume, pipeline, tap, transform } from "streaming-iterables";
import { Arguments, Argv, CommandModule } from "yargs";

import { declareStoreArgs, openStore, store, StoreArgs } from "./util";

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

abstract class FillCommandBase {
  protected buildGenDataArgv(argv: Argv): Argv<GenDataArgs> {
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
    });
  }

  protected async execute(args: GenDataArgs, f: (it: AsyncIterable<Data>) => Promise<unknown>) {
    const progress = new ProgressBar(":bar :current/:total :rateD/s :elapseds ETA:etas", { total: args.count });
    await pipeline(
      () => genData(args),
      tap(() => progress.tick()),
      f,
    );
    progress.terminate();
  }
}

type FillStoreArgs = GenDataArgs & StoreArgs & {
  batch: number;
  parallel: number;
}

export class FillStoreCommand extends FillCommandBase implements CommandModule<{}, FillStoreArgs> {
  public command = "fillstore";
  public describe = "fill repo with demo data via store transaction";

  public builder = (argv: Argv): Argv<FillStoreArgs> => {
    return declareStoreArgs(this.buildGenDataArgv(argv))
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

  public handler = async (args: Arguments<FillStoreArgs>) => {
    openStore(args);
    await this.execute(args, (it) => pipeline(
      () => it,
      batch(args.batch),
      transform(args.parallel, (pkts) => store.insert(...pkts)),
      consume,
    ));
  }
}

type FillBiArgs = GenDataArgs & {
  host: string;
  port: number;
}

export class FillBiCommand extends FillCommandBase implements CommandModule<{}, FillBiArgs> {
  public command = "fillbi";
  public describe = "fill repo with demo data via bulk insertion";

  public builder = (argv: Argv): Argv<FillBiArgs> => {
    return this.buildGenDataArgv(argv)
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
  }

  public handler = async (args: Arguments<FillBiArgs>) => {
    const face = new L3Face(await TcpTransport.connect(args.host, args.port));
    await this.execute(args, (it) => face.tx(it));
  }
}
