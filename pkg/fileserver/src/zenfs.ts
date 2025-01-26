import { LRUMap } from "@miyauci/lru-map";
import { assert } from "@ndn/util";
import { Async, type Backend, constants, Errno, ErrnoError, type File, FileSystem, type FileSystemMetadata, isWriteable, LazyFile, Readonly, Stats } from "@zenfs/core";
import { collect, map, pipeline } from "streaming-iterables";

import { Client } from "./client";
import type { FileMetadata } from "./metadata";

/**
 * ndn6-file-server client wrapped as ZenFS backend.
 *
 * @remarks
 * This backend only supports async operations.
 */
export class NDNFileSystem extends Async(Readonly(FileSystem)) { // eslint-disable-line etc/no-internal
  constructor(opts: NDNFileSystem.Options) {
    super();
    const {
      client,
      statsCacheCapacity = 16,
    } = opts;

    assert(client instanceof Client);
    this.client = client;

    if (statsCacheCapacity > 0) {
      this.statsCache = new LRUMap(statsCacheCapacity);
    }
  }

  public override ready(): Promise<void> {
    this._disableSync = true; // eslint-disable-line etc/no-internal
    return super.ready();
  }

  public override metadata(): FileSystemMetadata {
    return {
      ...super.metadata(),
      noAsyncCache: true,
    };
  }

  private readonly client: Client;
  private readonly statsCache?: LRUMap<string, FileMetadata>;

  private async getFileMetadata(path: string): Promise<FileMetadata> {
    let m = this.statsCache?.get(path);
    if (!m) {
      m = await this.client.stat(path.slice(1));
      this.statsCache?.set(path, m);
    }
    return m;
  }

  public override async stat(path: string): Promise<Stats> {
    const m = await this.getFileMetadata(path);
    return statsFromFileMetadata(m);
  }

  public override async readdir(path: string): Promise<string[]> {
    const m = await this.getFileMetadata(path);
    return pipeline(
      () => this.client.readdir(m),
      map((de) => de.name),
      collect,
    );
  }

  public override async openFile(path: string, flag: string): Promise<File> {
    if (isWriteable(flag)) {
      throw new ErrnoError(Errno.EROFS, "filesystem is readonly", path);
    }
    return new LazyFile(this, path, flag, await this.stat(path));
  }

  public override async read(path: string, buffer: Uint8Array, offset: number, end: number): Promise<void> {
    const m = await this.getFileMetadata(path);
    await this.client.readFileInto(m, buffer, 0, end - offset, offset);
  }
}
export namespace NDNFileSystem {
  export interface Options {
    client: Client;
    statsCacheCapacity?: number;
  }
}

function statsFromFileMetadata(m: FileMetadata): Stats {
  return new Stats({
    atimeMs: m.atime?.getTime(),
    mtimeMs: m.mtime.getTime(),
    ctimeMs: m.ctime?.getTime(),
    birthtimeMs: m.btime?.getTime(),
    size: m.size,
    mode: (m.isFile ? constants.S_IFREG : m.isDir ? constants.S_IFDIR : 0) | 0o644,
  });
}

/** ZenFS backend for {@link NDNFileSystem}. */
export const NDNZenFS = {
  name: "NDN",
  options: {
    client: {
      type: "object",
      description: "Client instance",
      required: true,
      validator(opt) {
        assert(opt instanceof Client);
      },
    },
    statsCacheCapacity: {
      type: "number",
      description: "cache capacity for FileMetadata, 0 disables cache",
      required: false,
      validator(opt) {
        assert(opt === undefined || (Number.isInteger(opt) && opt >= 0));
      },
    },
  },
  isAvailable() {
    return true;
  },
  create(opts: NDNFileSystem.Options) {
    return new NDNFileSystem(opts);
  },
} as const satisfies Backend<NDNFileSystem, NDNFileSystem.Options>;
