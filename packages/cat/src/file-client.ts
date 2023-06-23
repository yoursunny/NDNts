import fs from "node:fs";
import fsPromises from "node:fs/promises";
import path from "node:path/posix";

import { FileMetadata, lsKeyword, parseDirectoryListing } from "@ndn/fileserver";
import { Component, type ComponentLike, Name } from "@ndn/packet";
import { retrieveMetadata } from "@ndn/rdr";
import { fetch } from "@ndn/segmented-object";
import { console } from "@ndn/util";
import { pushable } from "it-pushable";
import { consume, parallelMap, writeToStream } from "streaming-iterables";
import type { CommandModule } from "yargs";

import { type CommonArgs, Segment } from "./util";

interface Args extends CommonArgs {
  remote: string;
  local: string;
  jobs: number;
  retx: number;
}

export const FileClientCommand: CommandModule<CommonArgs, Args> = {
  command: "file-client <remote> <local>",
  describe: "download a folder from ndn6-file-server",

  builder(argv) {
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
  },

  handler({ remote, local, jobs, retx }) {
    const dl = new Downloader(new Name(remote), local, jobs, retx);
    const abort = new AbortController();
    return dl.run(abort.signal);
  },
};

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

    await fsPromises.mkdir(local, { recursive: true });
    let nFolders = 0;
    let nFiles = 0;
    for (const { name, isDir } of parseDirectoryListing(ls)) {
      if (isDir) {
        this.enqueue("folder", path.resolve(local, name));
        ++nFolders;
      } else {
        this.enqueue("file", path.resolve(local, name));
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
        await fsPromises.unlink(local);
      }
    }

    await fsPromises.utimes(local, atime, mtime);
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
