import { fromUtf8 } from "@ndn/util";

import { type Mode, ModeDir, ModeFile } from "./an";

const slash = "/".codePointAt(0);

/** Parse directory listing payload from ndn6-file-server. */
export function* parseDirectoryListing(input: Uint8Array): Iterable<[string, Mode]> {
  for (let start = 0; start < input.length;) {
    const pos = input.indexOf(0, start);
    if (pos < 0) {
      throw new Error(`bad directory listing near offset ${start}`);
    }
    let mode: Mode = ModeFile;
    let end = pos;
    if (input.at(pos - 1) === slash) {
      end = pos - 1;
      mode = ModeDir;
    }
    yield [fromUtf8(input.subarray(start, end)), mode];
    start = pos + 1;
  }
}
