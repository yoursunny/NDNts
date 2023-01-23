import { posix as path } from "node:path";

import { Keyword } from "@ndn/naming-convention2";
import { type ComponentLike, Component, Name } from "@ndn/packet";
import { retrieveMetadata } from "@ndn/rdr";
import { fetch } from "@ndn/segmented-object";
import { console, fromUtf8 } from "@ndn/util";
import fs from "graceful-fs";
import { pushable } from "it-pushable";
import { consume, parallelMap, writeToStream } from "streaming-iterables";
import type { Arguments, Argv, CommandModule } from "yargs";

import { FileMetadata } from "./file-metadata";
import { type CommonArgs, Segment } from "./util";

interface Args extends CommonArgs {
  remote: string;
  local: string;
  jobs: number;
  retx: number;
}

export class FileClientCommand implements CommandModule<CommonArgs, Args> {
  public command = "file-client <remote> <local>";
  public describe = "download a folder from ndn6-file-server";

  public builder(argv: Argv<CommonArgs>): Argv<Args> {
    return argv
      .positional("remote", {
        demandOption: true,
        desc: "remote name prefix",
        type: "string",
      })
      .positional("local", {
        demandOption: true,
        desc: "local directory path",
        type: "string",
      })
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
    await dl.run(abort.signal);
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
  private readonly queue = pushable<Job>({ objectMode: true });
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
        case "folder": {
          await this.downloadFolder(local);
          break;
        }
        case "file": {
          await this.downloadFile(local);
          break;
        }
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
    const relComps = relPath === "" ? [] : relPath.split("/").map((s) => {
      if (s === "..") {
        throw new Error(`${local} is outside ${this.local}`);
      }
      return new Component(undefined, s);
    });
    return this.remote.append(...relComps, ...suffix);
  }

  private async mFetch(remote: Name): Promise<MFetch> {
    const metadata = await retrieveMetadata(remote, FileMetadata, {
      retx: this.retx,
      signal: this.signal,
    });
    const { name, lastSeg } = metadata;
    return {
      metadata,
      fetching: fetch(name, {
        segmentNumConvention: Segment,
        segmentRange: lastSeg === undefined ? undefined : [0, 1 + lastSeg],
        estimatedFinalSegNum: lastSeg,
        retxLimit: this.retx,
        signal: this.signal,
      }),
    };
  }

  private async downloadFolder(local: string) {
    const remote = this.deriveName(local, lsKeyword);
    const { metadata: { isDir }, fetching } = await this.mFetch(remote);
    if (!isDir) {
      throw new Error("not a directory");
    }
    const ls = await fetching;

    await fs.promises.mkdir(local, { recursive: true });
    let nFolders = 0; let
      nFiles = 0;
    for (const item of parseDirectoryListing(ls)) {
      if (item.endsWith("/")) {
        this.enqueue("folder", path.resolve(local, item));
        ++nFolders;
      } else {
        this.enqueue("file", path.resolve(local, item));
        ++nFiles;
      }
    }
    console.log(`FOLDER ${local} folders=${nFolders} files=${nFiles}`);
  }

  private async downloadFile(local: string) {
    const remote = this.deriveName(local);
    const { metadata: { isFile, atime = new Date(), mtime, size }, fetching } = await this.mFetch(remote);
    if (!isFile) {
      throw new Error("not a file");
    }

    let file: fs.WriteStream | undefined;
    let ok = false;
    try {
      file = fs.createWriteStream(local);
      await writeToStream(file, fetching.chunks());
      ok = true;
    } finally {
      file?.close();
      if (!ok) {
        await fs.promises.unlink(local);
      }
    }

    await fs.promises.utimes(local, atime, mtime);
    console.log(`FILE ${local} size=${size}`);
  }
}

interface Job {
  kind: "folder" | "file";
  local: string;
}

interface MFetch {
  metadata: FileMetadata;
  fetching: fetch.Result;
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
