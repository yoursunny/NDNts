import fs from "node:fs/promises";
import path from "node:path/posix";

import { Client } from "@ndn/fileserver";
import { Name } from "@ndn/packet";
import { assert, console } from "@ndn/util";
import { pushable } from "it-pushable";
import { consume, parallelMap } from "streaming-iterables";
import type { CommandModule } from "yargs";

import { type CommonArgs, Segment } from "./util";

interface Args extends CommonArgs {
  remote: Name;
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
        coerce: Name.from,
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
    const dl = new Downloader(remote, local, jobs, retx);
    return dl.run();
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

  private client!: Client;
  private readonly local: string;
  private readonly queue = pushable<Job>({ objectMode: true });
  private nProcessing = 0;
  private nQueued = 0;

  public async run() {
    this.client = new Client(this.remote, {
      segmentNumConvention: Segment,
      retx: this.retx,
      retxLimit: this.retx,
    });
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

  private relPath(local: string): string {
    const p = path.relative(this.local, local);
    assert(!p.startsWith(".."), "path outside top-level directory");
    return p;
  }

  private async downloadFolder(local: string) {
    const m = await this.client.stat(this.relPath(local));
    await fs.mkdir(local, { recursive: true });

    let nFolders = 0;
    let nFiles = 0;
    for await (const { name, isDir } of this.client.readdir(m)) {
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
    const m = await this.client.stat(this.relPath(local));
    const fh = await fs.open(local, "w");

    const fetching = this.client.readFile(m);

    let ok = false;
    try {
      await fetching.pipe(fh.createWriteStream());
      ok = true;
    } finally {
      await fh.close();
      if (!ok) {
        await fs.unlink(local);
      }
    }

    await fs.utimes(local, m.atime ?? new Date(), m.mtime);
    console.log(`FILE ${local} size=${m.size}`);
  }
}

interface Job {
  kind: "folder" | "file";
  local: string;
}
