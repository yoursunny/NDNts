import { fromUtf8, toUtf8 } from "@ndn/util";

const slash = "/".codePointAt(0);

/** Directory listing entry. */
export interface DirEntry {
  name: string;
  isDir: boolean;
}

/** Parse directory listing payload from ndn6-file-server. */
export function* parseDirectoryListing(input: Uint8Array): Iterable<DirEntry> {
  for (let start = 0; start < input.length;) {
    const pos = input.indexOf(0, start);
    if (pos < 0) {
      throw new Error(`bad directory listing near offset ${start}`);
    }
    let isDir = false;
    let end = pos;
    if (input.at(pos - 1) === slash) {
      end = pos - 1;
      isDir = true;
    }
    yield {
      name: fromUtf8(input.subarray(start, end)),
      isDir,
    };
    start = pos + 1;
  }
}

/** Build directory listing payload. */
export function buildDirectoryListing(entries: Iterable<DirEntry>): Uint8Array {
  return toUtf8(Array.from(entries, ({ name, isDir }) => {
    if (isDir) {
      return `${name}/\0`;
    }
    return `${name}\0`;
  }).join(""));
}
