import type { DataTape } from "./data-tape";

export function makeOpenFileStreamFunction(filename: string): DataTape.OpenStream {
  void filename;
  throw new Error("filesystem is not supported in browser");
}
