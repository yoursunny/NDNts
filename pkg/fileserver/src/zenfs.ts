import { LRUMap } from "@miyauci/lru-map";
import { assert } from "@ndn/util";
import { Async, type Backend, constants, FileSystem, type InodeLike, Readonly, Stats } from "@zenfs/core";
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
    super(0x006E646E, "ndn");
    this.attributes.set("no_async");

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

  public override async stat(path: string): Promise<InodeLike> { // eslint-disable-line etc/no-internal
    const m = await this.getFileMetadata(path);
    return new Stats({
      atimeMs: m.atime?.getTime(),
      mtimeMs: m.mtime.getTime(),
      ctimeMs: m.ctime?.getTime(),
      birthtimeMs: m.btime?.getTime(),
      size: m.size,
      mode: (m.isFile ? constants.S_IFREG : m.isDir ? constants.S_IFDIR : 0) | 0o644,
    });
  }

  public override async readdir(path: string): Promise<string[]> {
    const m = await this.getFileMetadata(path);
    return pipeline(
      () => this.client.readdir(m),
      map((de) => de.name),
      collect,
    );
  }

  public override async read(path: string, buffer: Uint8Array, offset: number, end: number): Promise<void> {
    const m = await this.getFileMetadata(path);
    await this.client.readFileInto(m, buffer, 0, end - offset, offset);
  }
}
export namespace NDNFileSystem {
  export interface Options {
    /** Client instance. */
    client: Client;

    /** Cache capacity for FileMetadata.
     * 0 disables cache.
     * @defaultValue 16
     */
    statsCacheCapacity?: number;
  }
}

/** ZenFS backend for {@link NDNFileSystem}. */
export const NDNZenFS = {
  create(opts: NDNFileSystem.Options) {
    return new NDNFileSystem(opts);
  },
  name: "NDN",
  options: {
    client: {
      type: Client,
      required: true,
    },
    statsCacheCapacity: {
      type(opt) {
        return Number.isInteger(opt) && opt >= 0;
      },
      required: false,
    },
  },
} as const satisfies Backend<NDNFileSystem, NDNFileSystem.Options>;
