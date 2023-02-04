import fs from "node:fs";

import type { DataTape } from "./data-tape";

export function makeOpenFileStreamFunction(filename: string): DataTape.OpenStream {
  return (mode) => {
    if (mode === "read") {
      return fs.createReadStream(filename);
    }
    return fs.createWriteStream(filename, { flags: "a" });
  };
}
