import { closeUplinks } from "@ndn/cli-common";
import { Keyword } from "@ndn/naming-convention2";
import { ComponentLike, Name } from "@ndn/packet";
import { retrieveMetadata } from "@ndn/rdr";
import { fetch } from "@ndn/segmented-object";
import AbortController, { AbortSignal } from "abort-controller";
import * as fs from "graceful-fs";
import pushable from "it-pushable";
import { posix as path } from "path";
import { consume, parallelMap, writeToStream } from "streaming-iterables";
import type { Arguments, Argv, CommandModule } from "yargs";

import { fromUtf8 } from "../../naming-convention2/node_modules/@ndn/tlv/src/string";
import { CommonArgs, segmentNumConvention } from "./common";

interface Args extends CommonArgs {
  remote: string;
  local: string;
  jobs: number;
  retx: number;
}

export class FileClientCommand implements CommandModule<CommonArgs, Args> {
  public command = "file-client <remote> <local>";
  public describe = "download a folder";
  public aliases = ["mget"];

  public builder(argv: Argv<CommonArgs>): Argv<Args> {
    return argv
      .positional("remote", {
        desc: "remote name prefix",
        type: "string",
      })
      .demandOption("remote")
      .positional("local", {
        desc: "local directory path",
        type: "string",
      })
      .demandOption("local")
      .option("jobs", {
        default: 4,
        desc: "maximum number of parallel tasks",
        type: "number",
      })
      .option("retx", {
        default: 10,
        desc: "retransmission limit",
        type: "number",
      });
  }

  public async handler(args: Arguments<Args>) {
    const dl = new Downloader(new Name(args.remote), args.local, args.jobs, args.retx);
    const abort = new AbortController();
    try {
      await dl.run(abort.signal);
    } finally {
      abort.abort();
      closeUplinks();
    }
  }
}

class Downloader {
  constructor(
      private readonly remote: Name,
      local: string,
      private readonly jobs: number,
      private readonly retx: number,
  ) {
    this.local = path.resolve(local);
  }

  private readonly local: string;
  private readonly queue = pushable<Job>();
  private signal!: AbortSignal;
  private nProcessing = 0;
  private nQueued = 0;

  public async run(signal: AbortSignal) {
    this.signal = signal;
    this.enqueue("folder", this.local);
    await consume(parallelMap(this.jobs, this.processJob, this.queue));
  }

  private enqueue(kind: "folder" | "file", local: string): void {
    this.queue.push({ kind, local });
    ++this.nQueued;
  }

  private readonly processJob = async ({ kind, local }: Job) => {
    ++this.nProcessing;
    --this.nQueued;
    try {
      switch (kind) {
        case "folder":
          await this.downloadFolder(local);
          break;
        case "file":
          await this.downloadFile(local);
          break;
      }
    } catch (err: unknown) {
      this.queue.end(new Error(`download ${kind} ./${path.relative(this.local, local)} error: ${err}`));
    } finally {
      --this.nProcessing;
      if (this.nProcessing === 0 && this.nQueued === 0) {
        this.queue.end();
      }
    }
  };

  private deriveName(local: string, ...suffix: ComponentLike[]): Name {
    const relPath = path.relative(this.local, local);
    if (relPath.startsWith("..")) {
      throw new Error(`${local} is outside ${this.local}`);
    }
    const relName = new Name(`/${relPath}`);
    return this.remote.append(...relName.comps, ...suffix);
  }

  private async mFetch(remote: Name): Promise<{ fetching: fetch.Result }> {
    const metadata = await retrieveMetadata(remote, {
      retx: this.retx,
      signal: this.signal,
    });
    // fetch.Result is a PromiseLike, wrap in object to prevent premature execution
    return {
      fetching: fetch(metadata.name, {
        segmentNumConvention,
        retxLimit: this.retx,
        signal: this.signal,
      }),
    };
  }

  private async downloadFolder(local: string) {
    await fs.promises.mkdir(local, { recursive: true });

    const remote = this.deriveName(local, lsKeyword);
    const { fetching } = await this.mFetch(remote);
    const ls = await fetching;

    for (const item of parseDirectoryListing(ls)) {
      if (item.endsWith("/")) {
        this.enqueue("folder", path.resolve(local, item));
      } else {
        this.enqueue("file", path.resolve(local, item));
      }
    }
  }

  private async downloadFile(local: string) {
    const remote = this.deriveName(local);
    const { fetching } = await this.mFetch(remote);

    let file: fs.WriteStream | undefined;
    try {
      file = fs.createWriteStream(local);
      await writeToStream(file, fetching.chunks());
    } finally {
      file?.close();
    }
  }
}

interface Job {
  kind: "folder" | "file";
  local: string;
}

const lsKeyword = Keyword.create("ls");

function* parseDirectoryListing(input: Uint8Array): Iterable<string> {
  for (let start = 0; start < input.length;) {
    const pos = input.indexOf(0, start);
    if (pos < 0) {
      throw new Error(`bad directory listing near offset ${start}`);
    }
    yield fromUtf8(input.subarray(start, pos));
    start = pos + 1;
  }
}
