import { Closers, console } from "@ndn/util";
import wtfnode from "wtfnode";

/** Print diagnostics to help determine why the program cannot exit. */
export function wtf() {
  wtfnode.setLogger("info", console.info);
  wtfnode.setLogger("warn", console.warn);
  wtfnode.setLogger("error", console.error);
  wtfnode.dump();
  wtfnode.resetLoggers();
}

export const exitClosers = new Closers();

/** SIGINT (CTRL+C) handler. */
export function exitHandler() {
  exitClosers.close();

  setTimeout(() => {
    console.warn("Process failed to exit 5 seconds after SIGINT. Diagnostics follow.");
    wtf();
  }, 5000).unref();
}

process.once("SIGINT", exitHandler);
