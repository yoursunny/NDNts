import { Component, type Name } from "@ndn/packet";
import { retrieveMetadata } from "@ndn/rdr";
import { fetch } from "@ndn/segmented-object";
import { assert } from "@ndn/util";

import { type DirEntry, parseDirectoryListing } from "./ls";
import { FileMetadata } from "./metadata";

export interface ClientOptions extends retrieveMetadata.Options, fetch.Options {
}

/** ndn6-file-server client. */
export class Client {
  constructor(
      public readonly prefix: Name,
      private readonly opts: ClientOptions = {}) {}

  /**
   * Retrieve metadata of given relative path.
   * @param relPath file/directory path relative to the mountpoint.
   */
  public stat(relPath: string): Promise<FileMetadata>;

  /**
   * Retrieve metadata of given relative path and directory entry.
   * @param parentRelPath parent directory path relative to the mountpoint.
   * @param de child directory entry.
   */
  public stat(parentRelPath: string, de: DirEntry): Promise<FileMetadata>;

  public stat(relPath: string, de?: DirEntry): Promise<FileMetadata> {
    const name = this.prefix.append(
      ...(relPath === "" ? [] : relPath.split("/").map((comp) => new Component(undefined, comp))),
      ...(de ? [de.name] : []),
    );
    return retrieveMetadata(name, FileMetadata, this.opts);
  }

  /**
   * List directory.
   * @param m metadata of a directory.
   */
  public async *readdir(m: FileMetadata): AsyncIterable<DirEntry> {
    assert(m.isDir, "not a directory");
    const payload = await fetch(m.name, this.opts);
    yield* parseDirectoryListing(payload);
  }

  /**
   * Retrieve entire contents of a file.
   * @param m metadata of a file.
   */
  public readFile(m: FileMetadata): fetch.Result {
    assert(m.isFile, "not a file");
    return fetch(m.name, {
      ...this.opts,
      segmentRange: [0, m.lastSeg! + 1],
    });
  }

  /**
   * Retrieve part of a file into a buffer.
   * @param m metadata of a file.
   * @param buffer the buffer that file contents will be written into.
   * @param offset the offset within the buffer where writing will start.
   * @param length the number of bytes to retrieve.
   * @param position where to begin reading from the file.
   */
  public async readFileInto(m: FileMetadata, buffer: Uint8Array, offset: number, length: number, position: number): Promise<void> {
    assert(m.isFile, "not a file");
    assert(offset >= 0);
    assert(length >= 0);
    assert(position >= 0);
    assert(offset + length <= buffer.length);
    assert(position + length <= m.size!);
    if (length === 0) {
      return;
    }

    const segFirst = Math.trunc(position / m.segmentSize!);
    const segLast = Math.trunc((position + length - 1) / m.segmentSize!);
    const fetching = fetch(m.name, {
      ...this.opts,
      segmentRange: [segFirst, segLast + 1],
    });

    for await (const { segNum, content } of fetching.unordered()) {
      let src = content;
      let dst = m.segmentSize! * segNum - position;
      if (dst < 0) {
        src = src.subarray(-dst);
        dst = 0;
      }
      if (dst + src.length > length) {
        src = src.subarray(0, length - dst);
      }
      buffer.set(src, offset + dst);
    }
  }
}
