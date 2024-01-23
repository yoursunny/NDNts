import { type BackendOption, CreateBackend } from "@browserfs/core/backends/backend.js";
import { ApiError, BaseFile, BaseFileSystem, type Cred, ErrorCode, type File, type FileFlag, type FileSystem, type FileSystemMetadata, FileType, Stats } from "@browserfs/core/index.js";
import { assert } from "@ndn/util";
import { collect, map, pipeline } from "streaming-iterables";

import { Client } from "./client";
import { type FileMetadata } from "./metadata";

/** ndn6-file-server client wrapped as BrowserFS backend. */
export class NDNFileSystem extends BaseFileSystem implements FileSystem {
  public static override readonly Name = "NDN";
  public static readonly Create = CreateBackend.bind(this);
  public static readonly Options = {
    client: {
      type: "object",
      description: "Client instance",
      validator(opt: Client) {
        assert(opt instanceof Client);
      },
    },
  } satisfies Record<string, BackendOption<unknown>>;

  public static isAvailable(): boolean {
    return true;
  }

  constructor(opts?: Partial<NDNFileSystem.Options>) {
    super();
    assert(opts?.client);
    this.client = opts.client;
  }

  private readonly client: Client;

  public override get metadata(): FileSystemMetadata {
    return Object.assign(super.metadata, {
      readonly: true,
    } as Partial<FileSystemMetadata>);
  }

  private async getFileMetadata(p: string): Promise<FileMetadata> {
    return this.client.stat(p.slice(1));
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
}
export namespace NDNFileSystem {
  export interface Options {
    client: Client;
  }
}

class NDNFile extends BaseFile implements File {
  constructor(
      private readonly client: Client,
      private readonly m: FileMetadata,
  ) {
    super();
    for (const methodName of fileMethods) {
      if (methodName.endsWith("Sync")) {
        this[methodName] = () => {
          throw new ApiError(ErrorCode.ENOTSUP);
        };
      } else {
        (this[methodName] as any) = async (...args: any[]) => (this as any)[`${methodName}Sync`](...args);
      }
    }
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
interface NDNFile extends Pick<File, typeof fileMethods[number]> {}

const fileMethods = [
  "stat",
  "close",
  "truncate", "truncateSync",
  "write", "writeSync",
  "readSync",
] as const satisfies ReadonlyArray<keyof File>;

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
