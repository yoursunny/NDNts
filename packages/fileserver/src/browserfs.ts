import { type BackendOption, CreateBackend } from "@browserfs/core/backends/backend.js";
import { ApiError, BaseFile, BaseFileSystem, type Cred, ErrorCode, type File, type FileFlag, type FileSystemMetadata, FileType, Stats } from "@browserfs/core/index.js";
import { assert } from "@ndn/util";
import LRUCache from "mnemonist/lru-cache.js";
import { collect, map, pipeline } from "streaming-iterables";

import { Client } from "./client";
import { type FileMetadata } from "./metadata";

/**
 * ndn6-file-server client wrapped as BrowserFS backend.
 * This backend only supports async operations.
 */
export class NDNFileSystem extends BaseFileSystem {
  public static override readonly Name = "NDN";
  public static readonly Create = CreateBackend.bind(this);
  public static readonly Options: Record<string, BackendOption<unknown>> = {
    client: {
      type: "object",
      description: "Client instance",
      validator(opt) {
        assert(opt instanceof Client);
      },
    },
    statsCacheCapacity: {
      type: "number",
      description: "cache capacity for FileMetadata, 0 disables cache",
      optional: true,
      validator(opt) {
        assert(typeof opt === "number");
      },
    },
  };

  public static isAvailable(): boolean {
    return true;
  }

  constructor(opts: Partial<NDNFileSystem.Options> = {}) {
    // opts is declared as optional and Partial to satisfy typing,
    // but bfs.configure() would validate it against Options definition.
    super(opts);
    const {
      client,
      statsCacheCapacity = 16,
    } = opts;

    assert(client instanceof Client);
    this.client = client;

    if (statsCacheCapacity > 0) {
      this.statsCache = new LRUCache(statsCacheCapacity);
    }
  }

  private readonly client: Client;
  private readonly statsCache?: LRUCache<string, FileMetadata>;

  public override get metadata(): FileSystemMetadata {
    return {
      ...super.metadata,
      readonly: true,
    };
  }

  private async getFileMetadata(p: string): Promise<FileMetadata> {
    let m = this.statsCache?.get(p);
    if (!m) {
      m = await this.client.stat(p.slice(1));
      this.statsCache?.set(p, m);
    }
    return m;
  }

  public override async stat(p: string, cred: Cred): Promise<Stats> {
    void cred;
    const m = await this.getFileMetadata(p);
    return statsFromFileMetadata(m);
  }

  public override async readdir(p: string, cred: Cred): Promise<string[]> {
    void cred;
    const m = await this.getFileMetadata(p);
    return pipeline(
      () => this.client.readdir(m),
      map((de) => de.name),
      collect,
    );
  }

  public override async openFile(p: string, flag: FileFlag, cred: Cred): Promise<File> {
    void cred;
    if (flag.isWriteable()) {
      throw new ApiError(ErrorCode.EPERM, p);
    }
    const m = await this.getFileMetadata(p);
    return new NDNFile(this.client, m);
  }

  public override async readFile(p: string, flag: FileFlag, cred: Cred): Promise<Uint8Array> {
    void flag;
    void cred;
    const m = await this.getFileMetadata(p);
    return this.client.readFile(m);
  }
}
export namespace NDNFileSystem {
  export interface Options {
    client: Client;
    statsCacheCapacity?: number;
  }
}

class NDNFile extends BaseFile implements File {
  constructor(
      private readonly client: Client,
      private readonly m: FileMetadata,
  ) {
    super();
  }

  public getPos(): number | undefined {
    return undefined;
  }

  public statSync(): Stats {
    return statsFromFileMetadata(this.m);
  }

  public closeSync(): void {
    //
  }

  public async read(buffer: Uint8Array, offset: number, length: number, position: number | null): Promise<{
    bytesRead: number;
    buffer: Uint8Array;
  }> {
    await this.client.readFileInto(this.m, buffer, offset, length, position ?? 0);
    return { bytesRead: length, buffer };
  }
}
interface NDNFile extends Pick<File, typeof fileMethodsNotsup[number] | typeof fileMethodsAsync[number]> {}
const fileMethodsNotsup = [
  "truncateSync",
  "writeSync",
  "readSync",
] as const satisfies ReadonlyArray<keyof File>;
const fileMethodsAsync = [
  "stat",
  "close",
  "truncate",
  "write",
] as const satisfies ReadonlyArray<keyof File>;
for (const methodName of fileMethodsNotsup) {
  NDNFile.prototype[methodName] = () => {
    throw new ApiError(ErrorCode.ENOTSUP);
  };
}
for (const methodName of fileMethodsAsync) {
  NDNFile.prototype[methodName] = async function (this: NDNFile, ...args: any[]) {
    return (this[`${methodName}Sync`] as any)(...args);
  };
}

function statsFromFileMetadata(m: FileMetadata): Stats {
  return new Stats(
    m.isFile ? FileType.FILE : m.isDir ? FileType.DIRECTORY : 0,
    m.size ?? 0,
    m.mode,
    m.atime?.getTime(),
    m.mtime.getTime(),
    m.ctime?.getTime(),
    0, // uid
    0, // gid
    m.btime?.getTime(),
  );
}
