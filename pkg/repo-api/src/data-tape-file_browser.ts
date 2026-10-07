import type { DataTape } from "./data-tape";

export function makeOpenFileStreamFunction(_filename: string): DataTape.OpenStream {
  throw new Error("filesystem is not supported in browser");
}
